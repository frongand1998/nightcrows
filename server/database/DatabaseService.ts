import * as mysql from 'mysql2/promise';
import { Logger } from '../utils/Logger';
import { IDatabaseService, User, Character } from './IDatabaseService';

export class DatabaseService implements IDatabaseService {
    private connection: mysql.Connection | null = null;
    private logger: Logger;

    constructor() {
        this.logger = new Logger();
    }

    public async initialize(): Promise<void> {
        try {
            // Create connection
            this.connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '3306'),
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'nightcrows_db'
            });

            this.logger.info('Connected to MySQL database');
            
            // Create tables if they don't exist
            await this.createTables();
            
        } catch (error) {
            this.logger.error('Database initialization failed:', error);
            
            // If database doesn't exist, create it
            if (error instanceof Error && error.message.includes('Unknown database')) {
                await this.createDatabase();
                await this.initialize(); // Retry initialization
            } else {
                throw error;
            }
        }
    }

    private async createDatabase(): Promise<void> {
        try {
            const tempConnection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '3306'),
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || ''
            });

            await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'nightcrows_db'}`);
            await tempConnection.end();
            
            this.logger.info('Database created successfully');
        } catch (error) {
            this.logger.error('Failed to create database:', error);
            throw error;
        }
    }

    private async createTables(): Promise<void> {
        if (!this.connection) throw new Error('Database not connected');

        // Users table
        await this.connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP NULL
            )
        `);

        // Characters table
        await this.connection.execute(`
            CREATE TABLE IF NOT EXISTS characters (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                name VARCHAR(50) UNIQUE NOT NULL,
                class ENUM('Warrior', 'Mage', 'Archer', 'Assassin') NOT NULL,
                level INT DEFAULT 1,
                experience BIGINT DEFAULT 0,
                hp INT DEFAULT 100,
                mp INT DEFAULT 50,
                strength INT DEFAULT 10,
                dexterity INT DEFAULT 10,
                intelligence INT DEFAULT 10,
                x_position FLOAT DEFAULT 0,
                y_position FLOAT DEFAULT 0,
                map_id INT DEFAULT 1,
                gold INT DEFAULT 1000,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Game sessions table
        await this.connection.execute(`
            CREATE TABLE IF NOT EXISTS game_sessions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                character_id INT,
                session_token VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
            )
        `);

        // Items table
        await this.connection.execute(`
            CREATE TABLE IF NOT EXISTS items (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                type ENUM('weapon', 'armor', 'consumable', 'misc') NOT NULL,
                rarity ENUM('common', 'uncommon', 'rare', 'epic', 'legendary') DEFAULT 'common',
                level_requirement INT DEFAULT 1,
                stats JSON,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Character inventory table
        await this.connection.execute(`
            CREATE TABLE IF NOT EXISTS character_inventory (
                id INT AUTO_INCREMENT PRIMARY KEY,
                character_id INT NOT NULL,
                item_id INT NOT NULL,
                quantity INT DEFAULT 1,
                equipped BOOLEAN DEFAULT FALSE,
                slot_position INT,
                FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE,
                FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
            )
        `);

        this.logger.info('Database tables created successfully');
    }

    // User operations
    public async createUser(username: string, email: string, passwordHash: string): Promise<number> {
        if (!this.connection) throw new Error('Database not connected');

        const [result] = await this.connection.execute(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, passwordHash]
        ) as any;

        return result.insertId;
    }

    public async getUserByUsername(username: string): Promise<User | null> {
        if (!this.connection) throw new Error('Database not connected');

        const [rows] = await this.connection.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        ) as any;

        return rows.length > 0 ? rows[0] : null;
    }

    public async getUserById(id: number): Promise<User | null> {
        if (!this.connection) throw new Error('Database not connected');

        const [rows] = await this.connection.execute(
            'SELECT * FROM users WHERE id = ?',
            [id]
        ) as any;

        return rows.length > 0 ? rows[0] : null;
    }

    public async updateLastLogin(userId: number): Promise<void> {
        if (!this.connection) throw new Error('Database not connected');

        await this.connection.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [userId]
        );
    }

    // Character operations
    public async createCharacter(character: Omit<Character, 'id' | 'created_at'>): Promise<number> {
        if (!this.connection) throw new Error('Database not connected');

        const [result] = await this.connection.execute(
            `INSERT INTO characters 
             (user_id, name, class, level, experience, hp, mp, strength, dexterity, intelligence, x_position, y_position, map_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                character.user_id, character.name, character.class, character.level,
                character.experience, character.hp, character.mp, character.strength,
                character.dexterity, character.intelligence, character.x_position,
                character.y_position, character.map_id
            ]
        ) as any;

        return result.insertId;
    }

    public async getCharactersByUserId(userId: number): Promise<Character[]> {
        if (!this.connection) throw new Error('Database not connected');

        const [rows] = await this.connection.execute(
            'SELECT * FROM characters WHERE user_id = ?',
            [userId]
        ) as any;

        return rows;
    }

    public async getCharacterById(id: number): Promise<Character | null> {
        if (!this.connection) throw new Error('Database not connected');

        const [rows] = await this.connection.execute(
            'SELECT * FROM characters WHERE id = ?',
            [id]
        ) as any;

        return rows.length > 0 ? rows[0] : null;
    }

    public async updateCharacterPosition(characterId: number, x: number, y: number, mapId?: number): Promise<void> {
        if (!this.connection) throw new Error('Database not connected');

        if (mapId !== undefined) {
            await this.connection.execute(
                'UPDATE characters SET x_position = ?, y_position = ?, map_id = ? WHERE id = ?',
                [x, y, mapId, characterId]
            );
        } else {
            await this.connection.execute(
                'UPDATE characters SET x_position = ?, y_position = ? WHERE id = ?',
                [x, y, characterId]
            );
        }
    }

    public async updateCharacterStats(characterId: number, stats: Partial<Character>): Promise<void> {
        if (!this.connection) throw new Error('Database not connected');

        const updateFields: string[] = [];
        const values: any[] = [];

        Object.entries(stats).forEach(([key, value]) => {
            if (key !== 'id' && key !== 'created_at' && value !== undefined) {
                updateFields.push(`${key} = ?`);
                values.push(value);
            }
        });

        if (updateFields.length > 0) {
            values.push(characterId);
            await this.connection.execute(
                `UPDATE characters SET ${updateFields.join(', ')} WHERE id = ?`,
                values
            );
        }
    }

    // Inventory operations
    public async getInventory(characterId: number): Promise<import('./IDatabaseService').Inventory | null> {
        if (!this.connection) throw new Error('Database not connected');

        const [rows] = await this.connection.execute(
            `SELECT ci.*, i.name, i.type, i.rarity, i.level_requirement, i.stats 
             FROM character_inventory ci 
             JOIN items i ON ci.item_id = i.id 
             WHERE ci.character_id = ?`,
            [characterId]
        ) as any;

        if (rows.length === 0) {
            return null;
        }

        const inventory: import('./IDatabaseService').Inventory = {
            characterId,
            items: JSON.stringify([]), // Start with empty array as JSON string
            gold: 1000, // Default gold amount
            capacity: 30
        };

        const itemsArray: any[] = [];
        rows.forEach((row: any) => {
            itemsArray.push({
                id: row.item_id,
                name: row.name,
                type: row.type,
                rarity: row.rarity,
                levelRequirement: row.level_requirement,
                stats: JSON.parse(row.stats || '{}'),
                quantity: row.quantity,
                equipped: row.equipped,
                slotPosition: row.slot_position
            });
        });

        inventory.items = JSON.stringify(itemsArray);

        return inventory;
    }

    public async createInventory(characterId: number): Promise<void> {
        // Inventory is created implicitly when items are added
        // For MySQL implementation, we don't need to create a separate inventory record
        this.logger.info(`Inventory initialized for character ${characterId}`);
    }

    public async updateInventoryItems(characterId: number, items: string): Promise<void> {
        if (!this.connection) throw new Error('Database not connected');

        // Parse the JSON string to get the items array
        const itemsArray = JSON.parse(items);

        // Start transaction
        await this.connection.beginTransaction();

        try {
            // Clear existing inventory items
            await this.connection.execute(
                'DELETE FROM character_inventory WHERE character_id = ?',
                [characterId]
            );

            // Insert new items
            for (const item of itemsArray) {
                await this.connection.execute(
                    `INSERT INTO character_inventory 
                     (character_id, item_id, quantity, equipped, slot_position) 
                     VALUES (?, ?, ?, ?, ?)`,
                    [characterId, item.id, item.quantity, item.equipped || false, item.slotPosition || null]
                );
            }

            await this.connection.commit();
        } catch (error) {
            await this.connection.rollback();
            throw error;
        }
    }

    public async updateInventoryGold(characterId: number, gold: number): Promise<void> {
        if (!this.connection) throw new Error('Database not connected');

        // For this implementation, we'll add a gold column to characters table
        // This is a simplified approach - in a real game you might have a separate wallet table
        await this.connection.execute(
            'UPDATE characters SET gold = ? WHERE id = ?',
            [gold, characterId]
        );
    }

    public async close(): Promise<void> {
        if (this.connection) {
            await this.connection.end();
            this.connection = null;
            this.logger.info('Database connection closed');
        }
    }
}
