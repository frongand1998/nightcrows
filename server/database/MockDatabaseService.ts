import { Logger } from '../utils/Logger';
import { IDatabaseService, User, Character, Inventory } from './IDatabaseService';

export class MockDatabaseService implements IDatabaseService {
    private logger: Logger;
    private users: Map<number, User> = new Map();
    private characters: Map<number, Character> = new Map();
    private inventories: Map<number, Inventory> = new Map();
    private nextUserId = 1;
    private nextCharacterId = 1;

    constructor() {
        this.logger = new Logger();
    }

    public async initialize(): Promise<void> {
        this.logger.info('Mock database initialized (in-memory storage)');
        
        // Add some sample data
        await this.createSampleData();
    }

    private async createSampleData(): Promise<void> {
        // Create a sample user for testing
        const sampleUser: User = {
            id: 1,
            username: 'testuser',
            email: 'test@example.com',
            password_hash: '$2b$12$8Ek.WkfY/wOj7oR8BjCcNOXZcK4h0YrLvYpV6PtJaKqZ4Rw8cD3.W', // password: 'testpass'
            created_at: new Date(),
            last_login: new Date()
        };
        
        this.users.set(1, sampleUser);
        this.nextUserId = 2;
        
        this.logger.info('Sample data created: testuser/testpass');
    }

    // User operations
    public async createUser(username: string, email: string, passwordHash: string): Promise<number> {
        const user: User = {
            id: this.nextUserId,
            username,
            email,
            password_hash: passwordHash,
            created_at: new Date()
        };
        
        this.users.set(this.nextUserId, user);
        const userId = this.nextUserId;
        this.nextUserId++;
        
        this.logger.info(`User created: ${username} (ID: ${userId})`);
        return userId;
    }

    public async getUserByUsername(username: string): Promise<User | null> {
        for (const user of this.users.values()) {
            if (user.username === username) {
                return user;
            }
        }
        return null;
    }

    public async getUserById(id: number): Promise<User | null> {
        return this.users.get(id) || null;
    }

    public async updateLastLogin(userId: number): Promise<void> {
        const user = this.users.get(userId);
        if (user) {
            user.last_login = new Date();
        }
    }

    // Character operations
    public async createCharacter(character: Omit<Character, 'id' | 'created_at'>): Promise<number> {
        const newCharacter: Character = {
            ...character,
            id: this.nextCharacterId,
            created_at: new Date()
        };
        
        this.characters.set(this.nextCharacterId, newCharacter);
        const characterId = this.nextCharacterId;
        this.nextCharacterId++;
        
        this.logger.info(`Character created: ${character.name} (ID: ${characterId})`);
        return characterId;
    }

    public async getCharactersByUserId(userId: number): Promise<Character[]> {
        const userCharacters: Character[] = [];
        for (const character of this.characters.values()) {
            if (character.user_id === userId) {
                userCharacters.push(character);
            }
        }
        return userCharacters;
    }

    public async getCharacterById(id: number): Promise<Character | null> {
        return this.characters.get(id) || null;
    }

    public async updateCharacterPosition(characterId: number, x: number, y: number, mapId?: number): Promise<void> {
        const character = this.characters.get(characterId);
        if (character) {
            character.x_position = x;
            character.y_position = y;
            if (mapId !== undefined) {
                character.map_id = mapId;
            }
        }
    }

    public async updateCharacterStats(characterId: number, stats: Partial<Character>): Promise<void> {
        const character = this.characters.get(characterId);
        if (character) {
            Object.assign(character, stats);
        }
    }

    public async close(): Promise<void> {
        this.logger.info('Mock database connection closed');
        this.users.clear();
        this.characters.clear();
        this.inventories.clear();
    }

    // Inventory operations
    public async getInventory(characterId: number): Promise<Inventory | null> {
        return this.inventories.get(characterId) || null;
    }

    public async createInventory(characterId: number): Promise<void> {
        this.inventories.set(characterId, {
            characterId,
            items: JSON.stringify([]),
            capacity: 30,
            gold: 1000
        });
    }

    public async updateInventoryItems(characterId: number, items: string): Promise<void> {
        const inventory = this.inventories.get(characterId);
        if (inventory) {
            inventory.items = items;
        }
    }

    public async updateInventoryGold(characterId: number, gold: number): Promise<void> {
        const inventory = this.inventories.get(characterId);
        if (inventory) {
            inventory.gold = gold;
        }
    }

    // Additional methods for debugging
    public getStats(): { users: number; characters: number; inventories: number } {
        return {
            users: this.users.size,
            characters: this.characters.size,
            inventories: this.inventories.size
        };
    }
}
