export interface User {
    id: number;
    username: string;
    email: string;
    password_hash: string;
    created_at: Date;
    last_login?: Date;
}

export interface Character {
    id: number;
    user_id: number;
    name: string;
    class: string;
    level: number;
    experience: number;
    hp: number;
    mp: number;
    strength: number;
    dexterity: number;
    intelligence: number;
    x_position: number;
    y_position: number;
    map_id: number;
    created_at: Date;
}

export interface Inventory {
    characterId: number;
    items: string; // JSON string
    capacity: number;
    gold: number;
}

export interface IDatabaseService {
    initialize(): Promise<void>;
    close(): Promise<void>;
    
    // User operations
    createUser(username: string, email: string, passwordHash: string): Promise<number>;
    getUserByUsername(username: string): Promise<User | null>;
    getUserById(id: number): Promise<User | null>;
    updateLastLogin(userId: number): Promise<void>;
    
    // Character operations
    createCharacter(character: Omit<Character, 'id' | 'created_at'>): Promise<number>;
    getCharactersByUserId(userId: number): Promise<Character[]>;
    getCharacterById(id: number): Promise<Character | null>;
    updateCharacterPosition(characterId: number, x: number, y: number, mapId?: number): Promise<void>;
    updateCharacterStats(characterId: number, stats: Partial<Character>): Promise<void>;
    
    // Inventory operations
    getInventory(characterId: number): Promise<Inventory | null>;
    createInventory(characterId: number): Promise<void>;
    updateInventoryItems(characterId: number, items: string): Promise<void>;
    updateInventoryGold(characterId: number, gold: number): Promise<void>;
}
