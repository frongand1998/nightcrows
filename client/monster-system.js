// Enhanced client-side monster and combat system
function initMonsterSystem() {
  // Global monster tracking
  window.monsters = new Map();
  window.combatTarget = null;

  // Add monster panel to the game area
  const gameArea = document.getElementById("gameArea");
  if (gameArea) {
    const monsterPanel = document.createElement("div");
    monsterPanel.innerHTML = `
            <div class="monster-area">
                <h4>👹 Nearby Monsters</h4>
                <div class="monster-list" id="monsterList"></div>
                <div class="combat-controls" id="combatControls" style="display: none;">
                    <h5>⚔️ Combat</h5>
                    <div id="targetInfo"></div>
                    <button onclick="attackTarget()">Attack</button>
                    <button onclick="stopCombat()">Stop Combat</button>
                </div>
                <div class="monster-stats">
                    <button onclick="loadMonsters()">Refresh Monsters</button>
                    <button onclick="loadMonsterStats()">Show Stats</button>
                </div>
            </div>
        `;
    monsterPanel.style.marginTop = "20px";
    gameArea.appendChild(monsterPanel);
  }
}

function loadMonsters() {
  if (!currentCharacter) {
    log("Please select a character first", "error");
    return;
  }

  fetch(`/api/game/monsters/${currentCharacter.position.mapId}`)
    .then((response) => response.json())
    .then((result) => {
      if (result.success) {
        displayMonsters(result.data);
        log(`Loaded ${result.data.length} monsters`, "success");
      } else {
        log("Failed to load monsters: " + result.message, "error");
      }
    })
    .catch((error) => {
      log("Load monsters error: " + error, "error");
    });
}

function displayMonsters(monsters) {
  const listElement = document.getElementById("monsterList");
  if (!listElement) return;

  // Update global monster tracking
  window.monsters.clear();
  monsters.forEach((monster) => {
    window.monsters.set(monster.id, monster);
  });

  listElement.innerHTML = "";

  if (monsters.length === 0) {
    listElement.innerHTML = '<p style="color: #888;">No monsters nearby</p>';
    return;
  }

  monsters.forEach((monster) => {
    const distance = currentCharacter
      ? GameUtils.getDistance(
          currentCharacter.position.x,
          currentCharacter.position.y,
          monster.position.x,
          monster.position.y,
        )
      : 0;

    const monsterDiv = document.createElement("div");
    monsterDiv.className = "monster-card";
    monsterDiv.innerHTML = `
            <div class="monster-info">
                <strong>${getMonsterEmoji(monster.type)} ${monster.name}</strong>
                <div class="monster-details">
                    <span>Level ${monster.level}</span>
                    <span class="hp-bar">
                        <div class="hp-fill" style="width: ${(monster.hp / monster.maxHp) * 100}%"></div>
                        <span class="hp-text">${monster.hp}/${monster.maxHp}</span>
                    </span>
                    <span>Distance: ${distance.toFixed(1)}</span>
                    <span>State: ${monster.state}</span>
                </div>
                <button onclick="targetMonster('${monster.id}')" 
                        ${monster.state === "dead" ? "disabled" : ""}>
                    ${window.combatTarget === monster.id ? "Targeted" : "Target"}
                </button>
            </div>
        `;

    // Add CSS for monster cards
    monsterDiv.style.cssText = `
            background: rgba(255,255,255,0.1);
            margin: 8px 0;
            padding: 10px;
            border-radius: 8px;
            border-left: 4px solid ${getMonsterColor(monster.type)};
        `;

    listElement.appendChild(monsterDiv);
  });
}

function getMonsterEmoji(type) {
  const emojis = {
    goblin: "👺",
    wolf: "🐺",
    orc: "👹",
    skeleton: "💀",
    spider: "🕷️",
    dragon: "🐉",
  };
  return emojis[type] || "👾";
}

function getMonsterColor(type) {
  const colors = {
    goblin: "#4caf50", // Green
    wolf: "#795548", // Brown
    orc: "#f44336", // Red
    skeleton: "#9e9e9e", // Grey
    spider: "#9c27b0", // Purple
    dragon: "#ff9800", // Orange
  };
  return colors[type] || "#607d8b";
}

function targetMonster(monsterId) {
  const monster = window.monsters.get(monsterId);
  if (!monster) {
    log("Monster not found", "error");
    return;
  }

  if (monster.state === "dead") {
    log("Cannot target dead monster", "error");
    return;
  }

  window.combatTarget = monsterId;
  updateCombatUI(monster);
  log(`Targeted ${monster.name} (Level ${monster.level})`, "info");

  // Refresh monster display to show targeting
  loadMonsters();
}

function updateCombatUI(monster) {
  const combatControls = document.getElementById("combatControls");
  const targetInfo = document.getElementById("targetInfo");

  if (combatControls && targetInfo) {
    combatControls.style.display = "block";
    targetInfo.innerHTML = `
            <div class="target-info">
                <strong>${getMonsterEmoji(monster.type)} ${monster.name}</strong>
                <div class="target-hp">
                    <div class="hp-bar">
                        <div class="hp-fill" style="width: ${(monster.hp / monster.maxHp) * 100}%"></div>
                        <span class="hp-text">${monster.hp}/${monster.maxHp}</span>
                    </div>
                </div>
                <p>Level ${monster.level} | ${monster.state}</p>
            </div>
        `;
  }
}

function attackTarget() {
  if (!window.combatTarget || !currentCharacter) {
    log("No target selected or character not loaded", "error");
    return;
  }

  const monster = window.monsters.get(window.combatTarget);
  if (!monster) {
    log("Target monster not found", "error");
    return;
  }

  if (monster.state === "dead") {
    log("Cannot attack dead monster", "error");
    stopCombat();
    return;
  }

  // Calculate damage (simplified)
  const baseDamage = 20; // Would be based on character stats and equipment
  const variance = Math.floor(Math.random() * 10) - 5; // ±5 damage
  const damage = Math.max(1, baseDamage + variance);

  // Send attack request to server
  fetch("/api/game/monster/attack", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      monsterId: window.combatTarget,
      damage: damage,
      characterId: currentCharacter.id,
    }),
  })
    .then((response) => response.json())
    .then((result) => {
      if (result.success) {
        const { killed, experience, gold } = result.data;

        log(`Attacked ${monster.name} for ${damage} damage`, "info");

        if (killed) {
          log(
            `${monster.name} defeated! +${experience} EXP, +${gold} gold`,
            "success",
          );
          stopCombat();

          // Add experience and gold to character (would need server update)
          addChatMessage(
            "System",
            `You defeated ${monster.name}! Gained ${experience} experience and ${gold} gold.`,
            "system",
          );
        }

        // Refresh monsters to show updated HP
        setTimeout(loadMonsters, 500);
      } else {
        log("Attack failed: " + result.message, "error");
      }
    })
    .catch((error) => {
      log("Attack error: " + error, "error");
    });
}

function stopCombat() {
  window.combatTarget = null;
  const combatControls = document.getElementById("combatControls");
  if (combatControls) {
    combatControls.style.display = "none";
  }
  log("Combat stopped", "info");
  loadMonsters(); // Refresh display
}

function loadMonsterStats() {
  fetch("/api/game/monsters/stats")
    .then((response) => response.json())
    .then((result) => {
      if (result.success) {
        const stats = result.data;
        const statsText = `
Total Monsters: ${stats.totalMonsters}
Per Map: ${JSON.stringify(stats.monstersPerMap)}
Per Type: ${JSON.stringify(stats.monstersPerType)}
                `.trim();

        log("Monster Statistics:", "info");
        log(statsText, "info");
      } else {
        log("Failed to load monster stats: " + result.message, "error");
      }
    })
    .catch((error) => {
      log("Monster stats error: " + error, "error");
    });
}

// WebSocket message handlers for monster events
function handleMonsterMessage(message) {
  switch (message.type) {
    case "monster_spawn":
      log(`Monster spawned: ${message.data.monster.name}`, "info");
      addChatMessage(
        "System",
        `A ${message.data.monster.name} has appeared!`,
        "system",
      );
      if (currentCharacter) {
        setTimeout(loadMonsters, 1000); // Refresh monster list
      }
      break;

    case "monster_died":
      log(`Monster defeated: ${message.data.monsterId}`, "info");
      if (window.combatTarget === message.data.monsterId) {
        stopCombat();
      }
      if (currentCharacter) {
        setTimeout(loadMonsters, 1000);
      }
      break;

    case "monster_moved":
      // Update monster position in local tracking
      if (window.monsters.has(message.data.monsterId)) {
        const monster = window.monsters.get(message.data.monsterId);
        monster.position = message.data.position;
      }
      break;

    case "monster_damaged":
      log(
        `Monster ${message.data.monsterId} took ${message.data.damage} damage`,
        "info",
      );
      // Update monster HP in local tracking
      if (window.monsters.has(message.data.monsterId)) {
        const monster = window.monsters.get(message.data.monsterId);
        monster.hp = message.data.currentHp;

        // Update combat UI if this is our target
        if (window.combatTarget === message.data.monsterId) {
          updateCombatUI(monster);
        }
      }
      break;

    case "monster_attack":
      if (message.data.targetId === currentCharacter?.id.toString()) {
        log(
          `You were attacked by a monster for ${message.data.damage} damage!`,
          "error",
        );
        addChatMessage(
          "System",
          `A monster attacked you for ${message.data.damage} damage!`,
          "system",
        );
      }
      break;
  }
}

// Initialize monster system when page loads
window.addEventListener("load", function () {
  initMonsterSystem();

  // Auto-refresh monsters every 10 seconds when in game
  setInterval(() => {
    if (
      currentCharacter &&
      document.getElementById("gameArea").style.display !== "none"
    ) {
      loadMonsters();
    }
  }, 10000);
});

// Add CSS for monster UI
const monsterCSS = `
.monster-area {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    padding: 15px;
    margin-top: 20px;
}

.monster-list {
    max-height: 300px;
    overflow-y: auto;
    margin: 10px 0;
}

.monster-card {
    background: rgba(255,255,255,0.1);
    margin: 8px 0;
    padding: 10px;
    border-radius: 8px;
    border-left: 4px solid #607d8b;
}

.monster-details {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 5px 0;
    font-size: 12px;
    color: #ccc;
}

.hp-bar {
    position: relative;
    background: rgba(0,0,0,0.5);
    height: 16px;
    border-radius: 8px;
    overflow: hidden;
    min-width: 100px;
}

.hp-fill {
    background: linear-gradient(90deg, #f44336, #ff9800, #4caf50);
    height: 100%;
    transition: width 0.3s ease;
}

.hp-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 10px;
    font-weight: bold;
    color: white;
    text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
}

.combat-controls {
    background: rgba(255,0,0,0.1);
    border: 1px solid #f44336;
    border-radius: 8px;
    padding: 15px;
    margin: 10px 0;
}

.target-info {
    margin-bottom: 10px;
}

.target-hp {
    margin: 5px 0;
}

.monster-stats button {
    margin: 5px;
    padding: 8px 16px;
    background: rgba(79, 195, 247, 0.2);
    border: 1px solid #4fc3f7;
}
`;

// Inject CSS
const styleSheet = document.createElement("style");
styleSheet.textContent = monsterCSS;
document.head.appendChild(styleSheet);
