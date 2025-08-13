import * as dotenv from 'dotenv';
import * as mysql from 'mysql2/promise';
import { Logger } from '../server/utils/Logger';

// Load environment variables
dotenv.config();

class DatabaseSetup {
    private logger: Logger;

    constructor() {
        this.logger = new Logger();
    }

    async setupDatabase(): Promise<void> {
        try {
            this.logger.info('Starting database setup...');

            // Create database if it doesn't exist
            await this.createDatabase();
            
            // Test connection to the new database
            await this.testConnection();
            
            // Insert sample data
            await this.insertSampleData();
            
            this.logger.info('Database setup completed successfully!');
            
        } catch (error) {
            this.logger.error('Database setup failed:', error);
            process.exit(1);
        }
    }

    private async createDatabase(): Promise<void> {
        try {
            // Connect without specifying database
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '3306'),
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || ''
            });

            const dbName = process.env.DB_NAME || 'nightcrows_db';
            
            // Create database
            await connection.execute(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
            this.logger.info(`Database '${dbName}' created or already exists`);
            
            await connection.end();
            
        } catch (error) {
            this.logger.error('Failed to create database:', error);
            throw error;
        }
    }

    private async testConnection(): Promise<void> {
        try {
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '3306'),
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'nightcrows_db'
            });

            this.logger.info('Successfully connected to database');
            await connection.end();
            
        } catch (error) {
            this.logger.error('Database connection test failed:', error);
            throw error;
        }
    }

    private async insertSampleData(): Promise<void> {
        try {
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '3306'),
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'nightcrows_db'
            });

            // Insert sample items
            const sampleItems = [
                {
                    name: 'Iron Sword',
                    type: 'weapon',
                    rarity: 'common',
                    level_requirement: 1,
                    stats: JSON.stringify({ attack: 10, durability: 100 })
                },
                {
                    name: 'Leather Armor',
                    type: 'armor',
                    rarity: 'common',
                    level_requirement: 1,
                    stats: JSON.stringify({ defense: 5, durability: 80 })
                },
                {
                    name: 'Health Potion',
                    type: 'consumable',
                    rarity: 'common',
                    level_requirement: 1,
                    stats: JSON.stringify({ healing: 50 })
                },
                {
                    name: 'Mana Potion',
                    type: 'consumable',
                    rarity: 'common',
                    level_requirement: 1,
                    stats: JSON.stringify({ mana_restore: 30 })
                },
                {
                    name: 'Dragon Blade',
                    type: 'weapon',
                    rarity: 'legendary',
                    level_requirement: 50,
                    stats: JSON.stringify({ attack: 100, critical_chance: 15, fire_damage: 25 })
                }
            ];

            for (const item of sampleItems) {
                await connection.execute(
                    'INSERT IGNORE INTO items (name, type, rarity, level_requirement, stats) VALUES (?, ?, ?, ?, ?)',
                    [item.name, item.type, item.rarity, item.level_requirement, item.stats]
                );
            }

            this.logger.info(`Inserted ${sampleItems.length} sample items`);
            await connection.end();
            
        } catch (error) {
            this.logger.error('Failed to insert sample data:', error);
            // Don't throw here as this is not critical
        }
    }
}

// Run setup if this file is executed directly
if (require.main === module) {
    const setup = new DatabaseSetup();
    setup.setupDatabase().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Setup failed:', error);
        process.exit(1);
    });
}

export { DatabaseSetup };
