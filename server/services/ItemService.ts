import { IDatabaseService } from '../database/IDatabaseService';
import { Logger } from '../utils/Logger';

export interface Item {
    id: string;
    name: string;
    description: string;
    type: ItemType;
    rarity: ItemRarity;
    level: number;
    stats: ItemStats;
    price: number;
    stackable: boolean;
    maxStack: number;
    icon: string;
    requirements?: ItemRequirements;
}

export interface ItemStats {
    attack?: number;
    defense?: number;
    hp?: number;
    mp?: number;
    agility?: number;
    strength?: number;
    intelligence?: number;
    criticalChance?: number;
    criticalDamage?: number;
}

export interface ItemRequirements {
    level?: number;
    class?: string[];
    strength?: number;
    agility?: number;
    intelligence?: number;
}

export interface InventoryItem {
    itemId: string;
    quantity: number;
    equipped: boolean;
    slot?: EquipmentSlot;
    enhancementLevel?: number;
    enhancementAttempts?: number;
}

export interface PlayerInventory {
    characterId: number;
    items: InventoryItem[];
    capacity: number;
    gold: number;
}

export type ItemType = 
    | 'weapon' 
    | 'armor' 
    | 'accessory' 
    | 'consumable' 
    | 'material' 
    | 'quest';

export type ItemRarity = 
    | 'common' 
    | 'uncommon' 
    | 'rare' 
    | 'epic' 
    | 'legendary' 
    | 'mythic';

export type EquipmentSlot = 
    | 'weapon' 
    | 'helmet' 
    | 'chest' 
    | 'legs' 
    | 'boots' 
    | 'gloves' 
    | 'ring' 
    | 'necklace';

export class ItemService {
    private database: IDatabaseService;
    private logger: Logger;
    private itemTemplates: Map<string, Item> = new Map();

    constructor(databaseService: IDatabaseService) {
        this.database = databaseService;
        this.logger = new Logger();
        this.initializeItemTemplates();
    }

    private initializeItemTemplates(): void {
        const items: Item[] = [
            // Weapons
            {
                id: 'iron_sword',
                name: 'Iron Sword',
                description: 'A sturdy iron sword. Sharp and reliable.',
                type: 'weapon',
                rarity: 'common',
                level: 1,
                stats: { attack: 15, criticalChance: 5 },
                price: 100,
                stackable: false,
                maxStack: 1,
                icon: '⚔️',
                requirements: { level: 1, class: ['warrior', 'assassin'] }
            },
            {
                id: 'wooden_bow',
                name: 'Wooden Bow',
                description: 'A simple wooden bow for hunting.',
                type: 'weapon',
                rarity: 'common',
                level: 1,
                stats: { attack: 12, agility: 3 },
                price: 80,
                stackable: false,
                maxStack: 1,
                icon: '🏹',
                requirements: { level: 1, class: ['archer'] }
            },
            {
                id: 'magic_staff',
                name: 'Apprentice Staff',
                description: 'A basic staff imbued with minor magic.',
                type: 'weapon',
                rarity: 'common',
                level: 1,
                stats: { attack: 10, mp: 20, intelligence: 5 },
                price: 120,
                stackable: false,
                maxStack: 1,
                icon: '🔮',
                requirements: { level: 1, class: ['mage'] }
            },
            {
                id: 'steel_dagger',
                name: 'Steel Dagger',
                description: 'A razor-sharp dagger for quick strikes.',
                type: 'weapon',
                rarity: 'uncommon',
                level: 5,
                stats: { attack: 25, criticalChance: 15, agility: 5 },
                price: 300,
                stackable: false,
                maxStack: 1,
                icon: '🗡️',
                requirements: { level: 5, class: ['assassin'] }
            },

            // Armor
            {
                id: 'leather_armor',
                name: 'Leather Armor',
                description: 'Light armor made from tanned leather.',
                type: 'armor',
                rarity: 'common',
                level: 1,
                stats: { defense: 8, hp: 25 },
                price: 150,
                stackable: false,
                maxStack: 1,
                icon: '🥼',
                requirements: { level: 1 }
            },
            {
                id: 'iron_helmet',
                name: 'Iron Helmet',
                description: 'A protective iron helmet.',
                type: 'armor',
                rarity: 'common',
                level: 3,
                stats: { defense: 12, hp: 15 },
                price: 200,
                stackable: false,
                maxStack: 1,
                icon: '⛑️',
                requirements: { level: 3 }
            },
            {
                id: 'chainmail',
                name: 'Chainmail Armor',
                description: 'Interlocked metal rings provide excellent protection.',
                type: 'armor',
                rarity: 'uncommon',
                level: 8,
                stats: { defense: 25, hp: 50, strength: 3 },
                price: 600,
                stackable: false,
                maxStack: 1,
                icon: '🛡️',
                requirements: { level: 8, strength: 15 }
            },

            // Accessories
            {
                id: 'power_ring',
                name: 'Ring of Power',
                description: 'A ring that enhances the wearer\'s strength.',
                type: 'accessory',
                rarity: 'rare',
                level: 10,
                stats: { attack: 15, strength: 8 },
                price: 800,
                stackable: false,
                maxStack: 1,
                icon: '💍',
                requirements: { level: 10 }
            },
            {
                id: 'mana_necklace',
                name: 'Mana Crystal Necklace',
                description: 'A necklace with a crystal that boosts magical power.',
                type: 'accessory',
                rarity: 'rare',
                level: 12,
                stats: { mp: 80, intelligence: 10, criticalDamage: 20 },
                price: 1000,
                stackable: false,
                maxStack: 1,
                icon: '📿',
                requirements: { level: 12, class: ['mage'] }
            },

            // Consumables
            {
                id: 'health_potion',
                name: 'Health Potion',
                description: 'Restores 50 HP when consumed.',
                type: 'consumable',
                rarity: 'common',
                level: 1,
                stats: { hp: 50 },
                price: 25,
                stackable: true,
                maxStack: 99,
                icon: '🧪',
                requirements: { level: 1 }
            },
            {
                id: 'mana_potion',
                name: 'Mana Potion',
                description: 'Restores 30 MP when consumed.',
                type: 'consumable',
                rarity: 'common',
                level: 1,
                stats: { mp: 30 },
                price: 20,
                stackable: true,
                maxStack: 99,
                icon: '🔵',
                requirements: { level: 1 }
            },

            // Materials
            {
                id: 'iron_ore',
                name: 'Iron Ore',
                description: 'Raw iron ore used in crafting.',
                type: 'material',
                rarity: 'common',
                level: 1,
                stats: {},
                price: 5,
                stackable: true,
                maxStack: 999,
                icon: '⚫',
                requirements: {}
            },
            {
                id: 'magic_crystal',
                name: 'Magic Crystal',
                description: 'A crystal infused with magical energy.',
                type: 'material',
                rarity: 'uncommon',
                level: 5,
                stats: {},
                price: 50,
                stackable: true,
                maxStack: 99,
                icon: '💎',
                requirements: {}
            }
        ];

        // Load items into templates map
        items.forEach(item => {
            this.itemTemplates.set(item.id, item);
        });

        this.logger.info(`Loaded ${items.length} item templates`);
    }

    public getAllItems(): Item[] {
        return Array.from(this.itemTemplates.values());
    }

    public getItemById(itemId: string): Item | null {
        return this.itemTemplates.get(itemId) || null;
    }

    public getItemsByType(type: ItemType): Item[] {
        return Array.from(this.itemTemplates.values())
            .filter(item => item.type === type);
    }

    public getItemsByRarity(rarity: ItemRarity): Item[] {
        return Array.from(this.itemTemplates.values())
            .filter(item => item.rarity === rarity);
    }

    public getItemsByLevel(minLevel: number, maxLevel?: number): Item[] {
        return Array.from(this.itemTemplates.values())
            .filter(item => {
                if (maxLevel) {
                    return item.level >= minLevel && item.level <= maxLevel;
                }
                return item.level >= minLevel;
            });
    }

    public async getPlayerInventory(characterId: number): Promise<PlayerInventory> {
        try {
            const inventory = await this.database.getInventory(characterId);

            if (!inventory) {
                // Create new inventory
                const newInventory: PlayerInventory = {
                    characterId,
                    items: [],
                    capacity: 30,
                    gold: 0
                };

                await this.database.createInventory(characterId);
                return newInventory;
            }

            return {
                characterId: inventory.characterId,
                items: JSON.parse(inventory.items || '[]'),
                capacity: inventory.capacity || 30,
                gold: inventory.gold || 0
            };
        } catch (error) {
            this.logger.error('Error getting player inventory:', error);
            throw error;
        }
    }

    public async addItemToInventory(characterId: number, itemId: string, quantity: number = 1): Promise<boolean> {
        try {
            const inventory = await this.getPlayerInventory(characterId);
            const item = this.getItemById(itemId);

            if (!item) {
                this.logger.error(`Item not found: ${itemId}`);
                return false;
            }

            // Check if item is stackable and already exists
            if (item.stackable) {
                const existingItem = inventory.items.find(inv => inv.itemId === itemId);
                if (existingItem) {
                    const newQuantity = existingItem.quantity + quantity;
                    if (newQuantity <= item.maxStack) {
                        existingItem.quantity = newQuantity;
                    } else {
                        this.logger.error(`Cannot add ${quantity} ${item.name}, would exceed max stack`);
                        return false;
                    }
                } else {
                    inventory.items.push({
                        itemId,
                        quantity: Math.min(quantity, item.maxStack),
                        equipped: false
                    });
                }
            } else {
                // Non-stackable items
                for (let i = 0; i < quantity; i++) {
                    if (inventory.items.length >= inventory.capacity) {
                        this.logger.error('Inventory is full');
                        return false;
                    }
                    inventory.items.push({
                        itemId,
                        quantity: 1,
                        equipped: false
                    });
                }
            }

            // Save to database
            await this.database.updateInventoryItems(characterId, JSON.stringify(inventory.items));

            this.logger.info(`Added ${quantity}x ${item.name} to character ${characterId}'s inventory`);
            return true;
        } catch (error) {
            this.logger.error('Error adding item to inventory:', error);
            return false;
        }
    }

    public async removeItemFromInventory(characterId: number, itemId: string, quantity: number = 1): Promise<boolean> {
        try {
            const inventory = await this.getPlayerInventory(characterId);
            const itemIndex = inventory.items.findIndex(inv => inv.itemId === itemId);

            if (itemIndex === -1) {
                this.logger.error(`Item ${itemId} not found in inventory`);
                return false;
            }

            const inventoryItem = inventory.items[itemIndex];
            if (inventoryItem.quantity < quantity) {
                this.logger.error(`Not enough ${itemId} in inventory`);
                return false;
            }

            if (inventoryItem.quantity === quantity) {
                inventory.items.splice(itemIndex, 1);
            } else {
                inventoryItem.quantity -= quantity;
            }

            // Save to database
            await this.database.updateInventoryItems(characterId, JSON.stringify(inventory.items));

            return true;
        } catch (error) {
            this.logger.error('Error removing item from inventory:', error);
            return false;
        }
    }

    public async equipItem(characterId: number, itemId: string, slot: EquipmentSlot): Promise<boolean> {
        try {
            const inventory = await this.getPlayerInventory(characterId);
            const item = this.getItemById(itemId);

            if (!item) {
                return false;
            }

            // Find the item in inventory
            const inventoryItem = inventory.items.find(inv => inv.itemId === itemId && !inv.equipped);
            if (!inventoryItem) {
                return false;
            }

            // Unequip any item in the same slot
            inventory.items.forEach(inv => {
                if (inv.slot === slot) {
                    inv.equipped = false;
                    inv.slot = undefined;
                }
            });

            // Equip the new item
            inventoryItem.equipped = true;
            inventoryItem.slot = slot;

            // Save to database
            await this.database.updateInventoryItems(characterId, JSON.stringify(inventory.items));

            this.logger.info(`Equipped ${item.name} to ${slot} for character ${characterId}`);
            return true;
        } catch (error) {
            this.logger.error('Error equipping item:', error);
            return false;
        }
    }

    public async updateGold(characterId: number, amount: number): Promise<boolean> {
        try {
            const inventory = await this.getPlayerInventory(characterId);
            inventory.gold = Math.max(0, inventory.gold + amount);

            await this.database.updateInventoryGold(characterId, inventory.gold);

            return true;
        } catch (error) {
            this.logger.error('Error updating gold:', error);
            return false;
        }
    }

    public generateRandomLoot(monsterLevel: number): { itemId: string; quantity: number }[] {
        const loot: { itemId: string; quantity: number }[] = [];
        
        // 70% chance for materials
        if (Math.random() < 0.7) {
            loot.push({
                itemId: 'iron_ore',
                quantity: Math.floor(Math.random() * 3) + 1
            });
        }

        // 30% chance for consumables
        if (Math.random() < 0.3) {
            loot.push({
                itemId: Math.random() < 0.6 ? 'health_potion' : 'mana_potion',
                quantity: Math.floor(Math.random() * 2) + 1
            });
        }

        // Rare equipment drops based on monster level
        if (monsterLevel >= 5 && Math.random() < 0.1) {
            const rareItems = ['steel_dagger', 'chainmail', 'power_ring'];
            loot.push({
                itemId: rareItems[Math.floor(Math.random() * rareItems.length)],
                quantity: 1
            });
        }

        return loot;
    }

    public async enhanceItem(characterId: number, itemId: string): Promise<{ success: boolean; newLevel?: number; message: string }> {
        try {
            const inventory = await this.getPlayerInventory(characterId);
            const item = this.getItemById(itemId);

            if (!item) {
                return { success: false, message: 'Item not found' };
            }

            // Find the equipped item
            const inventoryItem = inventory.items.find(inv => 
                inv.itemId === itemId && inv.equipped
            );

            if (!inventoryItem) {
                return { success: false, message: 'Item must be equipped to enhance' };
            }

            const currentLevel = inventoryItem.enhancementLevel || 0;
            const maxLevel = 15; // Maximum enhancement level

            if (currentLevel >= maxLevel) {
                return { success: false, message: 'Item is already at maximum enhancement level' };
            }

            // Calculate enhancement cost and success rate
            const cost = this.calculateEnhancementCost(currentLevel);
            const successRate = this.calculateSuccessRate(currentLevel);

            // Check if player has enough gold
            if (inventory.gold < cost.gold) {
                return { success: false, message: 'Insufficient gold' };
            }

            // Check for enhancement materials
            const materialItem = inventory.items.find(inv => 
                inv.itemId === 'iron_ore' && inv.quantity >= cost.materials
            );

            if (!materialItem) {
                return { success: false, message: 'Insufficient materials (Iron Ore required)' };
            }

            // Deduct cost
            await this.updateGold(characterId, -cost.gold);
            await this.removeItemFromInventory(characterId, 'iron_ore', cost.materials);

            // Enhancement attempt
            const isSuccess = Math.random() * 100 < successRate;
            inventoryItem.enhancementAttempts = (inventoryItem.enhancementAttempts || 0) + 1;

            if (isSuccess) {
                inventoryItem.enhancementLevel = currentLevel + 1;
                
                // Save updated inventory
                await this.database.updateInventoryItems(characterId, JSON.stringify(inventory.items));

                this.logger.info(`Enhancement successful: ${item.name} +${inventoryItem.enhancementLevel} for character ${characterId}`);
                
                return { 
                    success: true, 
                    newLevel: inventoryItem.enhancementLevel,
                    message: `Enhancement successful! ${item.name} is now +${inventoryItem.enhancementLevel}` 
                };
            } else {
                // Enhancement failed, but item is safe
                await this.database.updateInventoryItems(characterId, JSON.stringify(inventory.items));

                this.logger.info(`Enhancement failed for character ${characterId}: ${item.name} +${currentLevel}`);
                
                return { 
                    success: false, 
                    message: 'Enhancement failed! Gold and materials consumed, but item is safe.' 
                };
            }
        } catch (error) {
            this.logger.error('Error enhancing item:', error);
            return { success: false, message: 'Enhancement failed due to server error' };
        }
    }

    public calculateEnhancementCost(level: number): { gold: number; materials: number } {
        const baseGoldCost = 100;
        const baseMaterialCost = 2;
        
        return {
            gold: baseGoldCost * Math.pow(2, level),
            materials: baseMaterialCost + level
        };
    }

    public calculateSuccessRate(level: number): number {
        // Higher level = lower success rate
        const baseRate = 90;
        const levelPenalty = level * 8;
        return Math.max(30, baseRate - levelPenalty); // Minimum 30% success rate
    }

    public getEnhancedStats(item: Item, enhancementLevel: number): ItemStats {
        const enhancedStats: ItemStats = {};
        const multiplier = 1 + (enhancementLevel * 0.15); // 15% increase per level

        Object.entries(item.stats).forEach(([stat, value]) => {
            if (typeof value === 'number') {
                enhancedStats[stat as keyof ItemStats] = Math.floor(value * multiplier);
            }
        });

        return enhancedStats;
    }

    public async getPlayerEquipment(characterId: number): Promise<{ [slot: string]: InventoryItem & { item: Item } }> {
        try {
            const inventory = await this.getPlayerInventory(characterId);
            const equipment: { [slot: string]: InventoryItem & { item: Item } } = {};

            inventory.items.forEach(invItem => {
                if (invItem.equipped && invItem.slot) {
                    const item = this.getItemById(invItem.itemId);
                    if (item) {
                        equipment[invItem.slot] = { ...invItem, item };
                    }
                }
            });

            return equipment;
        } catch (error) {
            this.logger.error('Error getting player equipment:', error);
            return {};
        }
    }

    public async addStarterItems(characterId: number, characterClass: string): Promise<void> {
        try {
            // Add starter items based on character class
            const starterItems: { [key: string]: string[] } = {
                warrior: ['iron_sword', 'leather_armor', 'health_potion'],
                archer: ['wooden_bow', 'leather_armor', 'health_potion'],
                mage: ['magic_staff', 'leather_armor', 'mana_potion'],
                assassin: ['steel_dagger', 'leather_armor', 'health_potion']
            };

            const items = starterItems[characterClass.toLowerCase()] || starterItems.warrior;

            for (const itemId of items) {
                await this.addItemToInventory(characterId, itemId, 1);
            }

            // Add some starting gold and materials
            await this.updateGold(characterId, 500);
            await this.addItemToInventory(characterId, 'iron_ore', 10);

            this.logger.info(`Added starter items for ${characterClass} character ${characterId}`);
        } catch (error) {
            this.logger.error('Error adding starter items:', error);
        }
    }
}
