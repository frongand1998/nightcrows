import { WebSocketServer, WebSocket } from 'ws';
import { IDatabaseService } from '../database/IDatabaseService';
import { Logger } from '../utils/Logger';
import { GameUtils } from '../game/GameUtils';

export interface Monster {
    id: string;
    name: string;
    type: 'goblin' | 'orc' | 'skeleton' | 'dragon' | 'wolf' | 'spider';
    level: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    attack: number;
    defense: number;
    experience: number;
    goldDrop: number;
    position: {
        x: number;
        y: number;
        mapId: number;
    };
    state: 'idle' | 'patrolling' | 'chasing' | 'attacking' | 'dead';
    target?: string; // Character ID being chased
    lastAction: Date;
    respawnTime?: Date;
    aggroRange: number;
    patrolRange: number;
    originalPosition: { x: number; y: number };
}

export interface MonsterTemplate {
    name: string;
    type: Monster['type'];
    baseLevel: number;
    levelVariance: number;
    baseHp: number;
    baseAttack: number;
    baseDefense: number;
    baseExperience: number;
    baseGold: number;
    aggroRange: number;
    patrolRange: number;
    attackSpeed: number; // milliseconds between attacks
    moveSpeed: number; // pixels per second
    spawnMaps: number[];
    spawnChance: number; // 0-1
}

export class MonsterService {
    private db: IDatabaseService;
    private wss: WebSocketServer;
    private logger: Logger;
    
    private activeMonsters: Map<string, Monster> = new Map();
    private monsterTemplates: Map<string, MonsterTemplate> = new Map();
    private lastSpawnCheck: Date = new Date();
    private gameLoopInterval: NodeJS.Timeout | null = null;
    
    // Combat tracking
    private combatSessions: Map<string, {
        characterId: number;
        monsterId: string;
        lastAttack: Date;
    }> = new Map();

    constructor(databaseService: IDatabaseService, webSocketServer: WebSocketServer) {
        this.db = databaseService;
        this.wss = webSocketServer;
        this.logger = new Logger();
        
        this.initializeMonsterTemplates();
        this.startGameLoop();
    }

    private initializeMonsterTemplates(): void {
        const templates: MonsterTemplate[] = [
            {
                name: 'Goblin Warrior',
                type: 'goblin',
                baseLevel: 1,
                levelVariance: 3,
                baseHp: 50,
                baseAttack: 15,
                baseDefense: 5,
                baseExperience: 25,
                baseGold: 5,
                aggroRange: 50,
                patrolRange: 30,
                attackSpeed: 2000,
                moveSpeed: 25,
                spawnMaps: [1, 2],
                spawnChance: 0.8
            },
            {
                name: 'Forest Wolf',
                type: 'wolf',
                baseLevel: 3,
                levelVariance: 2,
                baseHp: 80,
                baseAttack: 25,
                baseDefense: 8,
                baseExperience: 45,
                baseGold: 8,
                aggroRange: 70,
                patrolRange: 50,
                attackSpeed: 1500,
                moveSpeed: 40,
                spawnMaps: [2],
                spawnChance: 0.6
            },
            {
                name: 'Orc Berserker',
                type: 'orc',
                baseLevel: 8,
                levelVariance: 3,
                baseHp: 150,
                baseAttack: 40,
                baseDefense: 15,
                baseExperience: 100,
                baseGold: 20,
                aggroRange: 60,
                patrolRange: 40,
                attackSpeed: 2500,
                moveSpeed: 30,
                spawnMaps: [2, 3],
                spawnChance: 0.4
            },
            {
                name: 'Ancient Skeleton',
                type: 'skeleton',
                baseLevel: 12,
                levelVariance: 4,
                baseHp: 200,
                baseAttack: 60,
                baseDefense: 20,
                baseExperience: 180,
                baseGold: 35,
                aggroRange: 80,
                patrolRange: 20,
                attackSpeed: 3000,
                moveSpeed: 20,
                spawnMaps: [3],
                spawnChance: 0.3
            },
            {
                name: 'Giant Spider',
                type: 'spider',
                baseLevel: 15,
                levelVariance: 2,
                baseHp: 250,
                baseAttack: 75,
                baseDefense: 25,
                baseExperience: 250,
                baseGold: 50,
                aggroRange: 90,
                patrolRange: 60,
                attackSpeed: 1800,
                moveSpeed: 35,
                spawnMaps: [3],
                spawnChance: 0.2
            },
            {
                name: 'Fire Dragon',
                type: 'dragon',
                baseLevel: 50,
                levelVariance: 10,
                baseHp: 2000,
                baseAttack: 300,
                baseDefense: 100,
                baseExperience: 5000,
                baseGold: 1000,
                aggroRange: 150,
                patrolRange: 100,
                attackSpeed: 4000,
                moveSpeed: 50,
                spawnMaps: [3],
                spawnChance: 0.01
            }
        ];

        templates.forEach(template => {
            this.monsterTemplates.set(template.type, template);
        });

        this.logger.info(`Loaded ${templates.length} monster templates`);
    }

    private startGameLoop(): void {
        // Run monster AI and spawning every 500ms
        this.gameLoopInterval = setInterval(() => {
            this.updateMonsters();
            this.checkSpawning();
        }, 500);

        this.logger.info('Monster service game loop started');
    }

    public stop(): void {
        if (this.gameLoopInterval) {
            clearInterval(this.gameLoopInterval);
            this.gameLoopInterval = null;
        }
        this.activeMonsters.clear();
        this.combatSessions.clear();
        this.logger.info('Monster service stopped');
    }

    private updateMonsters(): void {
        const now = new Date();
        
        for (const [monsterId, monster] of this.activeMonsters.entries()) {
            // Skip dead monsters that haven't respawned yet
            if (monster.state === 'dead') {
                if (monster.respawnTime && now > monster.respawnTime) {
                    this.respawnMonster(monsterId);
                }
                continue;
            }

            // Update monster AI based on state
            switch (monster.state) {
                case 'idle':
                    this.handleIdleState(monster);
                    break;
                case 'patrolling':
                    this.handlePatrolState(monster);
                    break;
                case 'chasing':
                    this.handleChaseState(monster);
                    break;
                case 'attacking':
                    this.handleAttackState(monster);
                    break;
            }

            // Check for nearby players to aggro
            if (monster.state === 'idle' || monster.state === 'patrolling') {
                this.checkForPlayerAggro(monster);
            }

            monster.lastAction = now;
        }
    }

    private handleIdleState(monster: Monster): void {
        // 30% chance to start patrolling every update
        if (Math.random() < 0.3) {
            monster.state = 'patrolling';
            this.logger.debug(`Monster ${monster.name} started patrolling`);
        }
    }

    private handlePatrolState(monster: Monster): void {
        const template = this.monsterTemplates.get(monster.type);
        if (!template) return;

        // Move randomly within patrol range
        const distance = GameUtils.getDistance(
            monster.position.x, monster.position.y,
            monster.originalPosition.x, monster.originalPosition.y
        );

        if (distance > monster.patrolRange) {
            // Return to original position
            this.moveMonsterTowards(monster, monster.originalPosition.x, monster.originalPosition.y);
        } else {
            // Random movement
            const angle = Math.random() * 2 * Math.PI;
            const moveDistance = template.moveSpeed * 0.5; // Half second movement
            const newX = monster.position.x + Math.cos(angle) * moveDistance;
            const newY = monster.position.y + Math.sin(angle) * moveDistance;
            
            if (GameUtils.isValidPosition(newX, newY, monster.position.mapId)) {
                monster.position.x = newX;
                monster.position.y = newY;
                this.broadcastMonsterMovement(monster);
            }
        }

        // 20% chance to go idle
        if (Math.random() < 0.2) {
            monster.state = 'idle';
        }
    }

    private handleChaseState(monster: Monster): void {
        if (!monster.target) {
            monster.state = 'idle';
            return;
        }

        // Get target character position (would need to query active sessions)
        // For now, simplified logic
        const template = this.monsterTemplates.get(monster.type);
        if (!template) return;

        // Check if target is still in aggro range
        // If target too far, return to patrol
        // For now, continue chasing for a bit then give up
        const timeSinceChase = Date.now() - monster.lastAction.getTime();
        if (timeSinceChase > 10000) { // 10 seconds
            monster.state = 'patrolling';
            monster.target = undefined;
            this.logger.debug(`Monster ${monster.name} lost target`);
            return;
        }

        // Move towards target (simplified - would need actual target position)
        monster.state = 'attacking';
    }

    private handleAttackState(monster: Monster): void {
        if (!monster.target) {
            monster.state = 'idle';
            return;
        }

        const template = this.monsterTemplates.get(monster.type);
        if (!template) return;

        // Check if we can attack (attack speed cooldown)
        const timeSinceLastAttack = Date.now() - monster.lastAction.getTime();
        if (timeSinceLastAttack >= template.attackSpeed) {
            this.performMonsterAttack(monster);
            monster.lastAction = new Date();
        }
    }

    private checkForPlayerAggro(monster: Monster): void {
        // This would check active player sessions for nearby players
        // For now, simplified implementation
        const aggroChance = 0.05; // 5% chance per update to aggro random player
        if (Math.random() < aggroChance) {
            // Simulate finding a player
            monster.state = 'chasing';
            monster.target = 'player_' + Math.floor(Math.random() * 1000);
            this.logger.debug(`Monster ${monster.name} found target: ${monster.target}`);
        }
    }

    private moveMonsterTowards(monster: Monster, targetX: number, targetY: number): void {
        const template = this.monsterTemplates.get(monster.type);
        if (!template) return;

        const distance = GameUtils.getDistance(monster.position.x, monster.position.y, targetX, targetY);
        if (distance === 0) return;

        const moveDistance = template.moveSpeed * 0.5; // Half second movement
        const ratio = Math.min(moveDistance / distance, 1);

        const newX = monster.position.x + (targetX - monster.position.x) * ratio;
        const newY = monster.position.y + (targetY - monster.position.y) * ratio;

        if (GameUtils.isValidPosition(newX, newY, monster.position.mapId)) {
            monster.position.x = newX;
            monster.position.y = newY;
            this.broadcastMonsterMovement(monster);
        }
    }

    private performMonsterAttack(monster: Monster): void {
        if (!monster.target) return;

        const damage = monster.attack + Math.floor(Math.random() * 10) - 5; // ±5 damage variance
        
        this.logger.info(`Monster ${monster.name} attacks ${monster.target} for ${damage} damage`);

        // Broadcast attack to players
        this.broadcastToMap(monster.position.mapId, {
            type: 'monster_attack',
            data: {
                monsterId: monster.id,
                targetId: monster.target,
                damage: damage,
                position: monster.position
            }
        });

        // 30% chance to continue attacking, 70% to go back to chasing
        if (Math.random() < 0.3) {
            monster.state = 'chasing';
        }
    }

    private checkSpawning(): void {
        const now = new Date();
        const timeSinceLastCheck = now.getTime() - this.lastSpawnCheck.getTime();
        
        // Check spawning every 5 seconds
        if (timeSinceLastCheck < 5000) return;
        
        this.lastSpawnCheck = now;

        // Count monsters per map
        const monsterCountPerMap: Map<number, number> = new Map();
        for (const monster of this.activeMonsters.values()) {
            if (monster.state !== 'dead') {
                const count = monsterCountPerMap.get(monster.position.mapId) || 0;
                monsterCountPerMap.set(monster.position.mapId, count + 1);
            }
        }

        // Try to spawn monsters on each map
        for (let mapId = 1; mapId <= 3; mapId++) {
            const currentCount = monsterCountPerMap.get(mapId) || 0;
            const maxMonstersPerMap = 20; // Configurable

            if (currentCount < maxMonstersPerMap) {
                this.trySpawnMonster(mapId);
            }
        }
    }

    private trySpawnMonster(mapId: number): void {
        // Select random monster template that can spawn on this map
        const availableTemplates = Array.from(this.monsterTemplates.values())
            .filter(template => template.spawnMaps.includes(mapId));

        if (availableTemplates.length === 0) return;

        // Weighted random selection based on spawn chance
        const totalWeight = availableTemplates.reduce((sum, template) => sum + template.spawnChance, 0);
        let random = Math.random() * totalWeight;

        let selectedTemplate: MonsterTemplate | null = null;
        for (const template of availableTemplates) {
            random -= template.spawnChance;
            if (random <= 0) {
                selectedTemplate = template;
                break;
            }
        }

        if (!selectedTemplate) return;

        // Only 10% chance to actually spawn per check
        if (Math.random() > 0.1) return;

        this.spawnMonster(selectedTemplate, mapId);
    }

    private spawnMonster(template: MonsterTemplate, mapId: number): void {
        const position = GameUtils.generateRandomPosition(mapId);
        const level = template.baseLevel + Math.floor(Math.random() * template.levelVariance);
        const levelMultiplier = 1 + (level - template.baseLevel) * 0.2;

        const monster: Monster = {
            id: `monster_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: template.name,
            type: template.type,
            level: level,
            hp: Math.floor(template.baseHp * levelMultiplier),
            maxHp: Math.floor(template.baseHp * levelMultiplier),
            mp: 50,
            maxMp: 50,
            attack: Math.floor(template.baseAttack * levelMultiplier),
            defense: Math.floor(template.baseDefense * levelMultiplier),
            experience: Math.floor(template.baseExperience * levelMultiplier),
            goldDrop: Math.floor(template.baseGold * levelMultiplier),
            position: { ...position, mapId },
            state: 'idle',
            lastAction: new Date(),
            aggroRange: template.aggroRange,
            patrolRange: template.patrolRange,
            originalPosition: { x: position.x, y: position.y }
        };

        this.activeMonsters.set(monster.id, monster);
        
        this.logger.info(`Spawned ${monster.name} (Level ${monster.level}) at map ${mapId}`);

        // Broadcast monster spawn to players on the map
        this.broadcastToMap(mapId, {
            type: 'monster_spawn',
            data: {
                monster: this.getMonsterPublicData(monster)
            }
        });
    }

    private respawnMonster(monsterId: string): void {
        const monster = this.activeMonsters.get(monsterId);
        if (!monster) return;

        // Reset monster to full health and idle state
        monster.hp = monster.maxHp;
        monster.mp = monster.maxMp;
        monster.state = 'idle';
        monster.target = undefined;
        monster.position.x = monster.originalPosition.x;
        monster.position.y = monster.originalPosition.y;
        monster.respawnTime = undefined;
        monster.lastAction = new Date();

        this.logger.info(`Respawned ${monster.name} at original position`);

        // Broadcast respawn
        this.broadcastToMap(monster.position.mapId, {
            type: 'monster_spawn',
            data: {
                monster: this.getMonsterPublicData(monster)
            }
        });
    }

    public damageMonster(monsterId: string, damage: number, attackerId: number): {
        killed: boolean;
        experience: number;
        gold: number;
    } {
        const monster = this.activeMonsters.get(monsterId);
        if (!monster || monster.state === 'dead') {
            return { killed: false, experience: 0, gold: 0 };
        }

        // Apply damage
        const actualDamage = Math.max(1, damage - monster.defense);
        monster.hp = Math.max(0, monster.hp - actualDamage);

        this.logger.info(`Monster ${monster.name} took ${actualDamage} damage (${monster.hp}/${monster.maxHp} HP)`);

        // Set monster to target the attacker
        if (monster.hp > 0) {
            monster.target = attackerId.toString();
            monster.state = 'chasing';
        }

        // Broadcast damage
        this.broadcastToMap(monster.position.mapId, {
            type: 'monster_damaged',
            data: {
                monsterId: monster.id,
                damage: actualDamage,
                currentHp: monster.hp,
                maxHp: monster.maxHp
            }
        });

        // Check if monster died
        if (monster.hp <= 0) {
            return this.killMonster(monster, attackerId);
        }

        return { killed: false, experience: 0, gold: 0 };
    }

    private killMonster(monster: Monster, killerId: number): {
        killed: boolean;
        experience: number;
        gold: number;
    } {
        monster.state = 'dead';
        monster.target = undefined;
        monster.respawnTime = new Date(Date.now() + 30000); // Respawn in 30 seconds

        this.logger.info(`Monster ${monster.name} was killed by player ${killerId}`);

        // Broadcast death
        this.broadcastToMap(monster.position.mapId, {
            type: 'monster_died',
            data: {
                monsterId: monster.id,
                killerId: killerId,
                experience: monster.experience,
                gold: monster.goldDrop,
                position: monster.position
            }
        });

        return {
            killed: true,
            experience: monster.experience,
            gold: monster.goldDrop
        };
    }

    public getActiveMonsters(mapId?: number): Monster[] {
        const monsters = Array.from(this.activeMonsters.values());
        if (mapId !== undefined) {
            return monsters.filter(monster => 
                monster.position.mapId === mapId && monster.state !== 'dead'
            );
        }
        return monsters.filter(monster => monster.state !== 'dead');
    }

    public getMonsterById(monsterId: string): Monster | null {
        return this.activeMonsters.get(monsterId) || null;
    }

    private getMonsterPublicData(monster: Monster) {
        return {
            id: monster.id,
            name: monster.name,
            type: monster.type,
            level: monster.level,
            hp: monster.hp,
            maxHp: monster.maxHp,
            position: monster.position,
            state: monster.state
        };
    }

    private broadcastMonsterMovement(monster: Monster): void {
        this.broadcastToMap(monster.position.mapId, {
            type: 'monster_moved',
            data: {
                monsterId: monster.id,
                position: monster.position
            }
        });
    }

    private broadcastToMap(mapId: number, message: any): void {
        // This would integrate with the GameService to broadcast to players on specific maps
        // For now, we'll log the broadcast
        this.logger.debug(`Broadcasting to map ${mapId}: ${message.type}`);
    }

    public getStats(): {
        totalMonsters: number;
        monstersPerMap: { [mapId: number]: number };
        monstersPerType: { [type: string]: number };
    } {
        const stats = {
            totalMonsters: 0,
            monstersPerMap: {} as { [mapId: number]: number },
            monstersPerType: {} as { [type: string]: number }
        };

        for (const monster of this.activeMonsters.values()) {
            if (monster.state !== 'dead') {
                stats.totalMonsters++;
                
                // Count per map
                stats.monstersPerMap[monster.position.mapId] = 
                    (stats.monstersPerMap[monster.position.mapId] || 0) + 1;
                
                // Count per type
                stats.monstersPerType[monster.type] = 
                    (stats.monstersPerType[monster.type] || 0) + 1;
            }
        }

        return stats;
    }
}
