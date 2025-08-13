export interface GameConfig {
    maxLevel: number;
    experienceTable: number[];
    classMultipliers: {
        [key: string]: {
            hpPerLevel: number;
            mpPerLevel: number;
            strPerLevel: number;
            dexPerLevel: number;
            intPerLevel: number;
        };
    };
    mapBoundaries: {
        [mapId: number]: {
            minX: number;
            maxX: number;
            minY: number;
            maxY: number;
        };
    };
}

export const gameConfig: GameConfig = {
    maxLevel: 100,
    experienceTable: generateExperienceTable(100),
    classMultipliers: {
        Warrior: {
            hpPerLevel: 15,
            mpPerLevel: 2,
            strPerLevel: 3,
            dexPerLevel: 1,
            intPerLevel: 1
        },
        Mage: {
            hpPerLevel: 8,
            mpPerLevel: 12,
            strPerLevel: 1,
            dexPerLevel: 1,
            intPerLevel: 3
        },
        Archer: {
            hpPerLevel: 10,
            mpPerLevel: 5,
            strPerLevel: 2,
            dexPerLevel: 3,
            intPerLevel: 1
        },
        Assassin: {
            hpPerLevel: 9,
            mpPerLevel: 4,
            strPerLevel: 2,
            dexPerLevel: 3,
            intPerLevel: 1
        }
    },
    mapBoundaries: {
        1: { minX: 0, maxX: 1000, minY: 0, maxY: 1000 }, // Starting village
        2: { minX: 0, maxX: 1500, minY: 0, maxY: 1500 }, // Forest
        3: { minX: 0, maxX: 2000, minY: 0, maxY: 2000 }  // Mountain
    }
};

function generateExperienceTable(maxLevel: number): number[] {
    const table: number[] = [0]; // Level 1 = 0 exp
    
    for (let level = 2; level <= maxLevel; level++) {
        // Exponential growth: base * level^2 + bonus
        const baseExp = 100;
        const expForLevel = Math.floor(baseExp * Math.pow(level - 1, 1.8));
        table.push(table[level - 2] + expForLevel);
    }
    
    return table;
}

export class GameUtils {
    static getRequiredExperience(level: number): number {
        if (level <= 1 || level > gameConfig.maxLevel) return 0;
        return gameConfig.experienceTable[level - 1];
    }

    static canLevelUp(currentLevel: number, currentExp: number): boolean {
        if (currentLevel >= gameConfig.maxLevel) return false;
        const requiredExp = this.getRequiredExperience(currentLevel + 1);
        return currentExp >= requiredExp;
    }

    static calculateLevelFromExp(experience: number): number {
        for (let level = 1; level <= gameConfig.maxLevel; level++) {
            if (experience < this.getRequiredExperience(level + 1)) {
                return level;
            }
        }
        return gameConfig.maxLevel;
    }

    static getStatsForLevel(characterClass: string, level: number): {
        hp: number;
        mp: number;
        strength: number;
        dexterity: number;
        intelligence: number;
    } {
        const multipliers = gameConfig.classMultipliers[characterClass];
        if (!multipliers) {
            throw new Error(`Unknown character class: ${characterClass}`);
        }

        const levelsGained = level - 1;
        
        return {
            hp: this.getBaseStats(characterClass).hp + (multipliers.hpPerLevel * levelsGained),
            mp: this.getBaseStats(characterClass).mp + (multipliers.mpPerLevel * levelsGained),
            strength: this.getBaseStats(characterClass).strength + (multipliers.strPerLevel * levelsGained),
            dexterity: this.getBaseStats(characterClass).dexterity + (multipliers.dexPerLevel * levelsGained),
            intelligence: this.getBaseStats(characterClass).intelligence + (multipliers.intPerLevel * levelsGained)
        };
    }

    static getBaseStats(characterClass: string): {
        hp: number;
        mp: number;
        strength: number;
        dexterity: number;
        intelligence: number;
    } {
        const baseStats = {
            Warrior: { hp: 150, mp: 50, strength: 15, dexterity: 10, intelligence: 8 },
            Mage: { hp: 80, mp: 120, strength: 8, dexterity: 10, intelligence: 15 },
            Archer: { hp: 100, mp: 80, strength: 10, dexterity: 15, intelligence: 10 },
            Assassin: { hp: 90, mp: 70, strength: 12, dexterity: 15, intelligence: 8 }
        };

        return baseStats[characterClass as keyof typeof baseStats] || baseStats.Warrior;
    }

    static isValidPosition(x: number, y: number, mapId: number): boolean {
        const boundaries = gameConfig.mapBoundaries[mapId];
        if (!boundaries) return false;

        return x >= boundaries.minX && x <= boundaries.maxX &&
               y >= boundaries.minY && y <= boundaries.maxY;
    }

    static getDistance(x1: number, y1: number, x2: number, y2: number): number {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }

    static generateRandomPosition(mapId: number): { x: number; y: number } {
        const boundaries = gameConfig.mapBoundaries[mapId];
        if (!boundaries) {
            return { x: 100, y: 100 }; // Default safe position
        }

        return {
            x: Math.random() * (boundaries.maxX - boundaries.minX) + boundaries.minX,
            y: Math.random() * (boundaries.maxY - boundaries.minY) + boundaries.minY
        };
    }

    static calculateCombatDamage(attacker: {
        level: number;
        strength: number;
        dexterity: number;
        intelligence: number;
    }, target: {
        level: number;
        strength: number;
        dexterity: number;
        intelligence: number;
    }, weaponAttack: number = 0): {
        damage: number;
        isCritical: boolean;
    } {
        // Base damage calculation
        const baseDamage = attacker.strength + weaponAttack;
        const levelDifference = attacker.level - target.level;
        const levelMultiplier = 1 + (levelDifference * 0.05); // 5% per level difference

        // Critical hit chance based on dexterity
        const criticalChance = Math.min(0.5, attacker.dexterity / 200); // Max 50% crit
        const isCritical = Math.random() < criticalChance;
        
        // Defense reduction based on target's strength
        const defense = target.strength * 0.5;
        
        let finalDamage = Math.max(1, (baseDamage * levelMultiplier) - defense);
        
        if (isCritical) {
            finalDamage *= 2;
        }

        return {
            damage: Math.floor(finalDamage),
            isCritical
        };
    }
}

export const GAME_EVENTS = {
    PLAYER_MOVE: 'player_move',
    PLAYER_ATTACK: 'player_attack',
    PLAYER_LEVEL_UP: 'player_level_up',
    PLAYER_DIED: 'player_died',
    ITEM_PICKUP: 'item_pickup',
    CHAT_MESSAGE: 'chat_message',
    MONSTER_SPAWN: 'monster_spawn',
    MONSTER_DIED: 'monster_died'
} as const;
