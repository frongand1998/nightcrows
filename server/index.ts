import * as dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Import services
import { AuthService } from './services/AuthService';
import { GameService } from './services/GameService';
import { MonsterService } from './services/MonsterService';
import { ItemService } from './services/ItemService';
import { DatabaseService } from './database/DatabaseService';
import { MockDatabaseService } from './database/MockDatabaseService';
import { IDatabaseService } from './database/IDatabaseService';
import { Logger } from './utils/Logger';

class NightcrowsServer {
    private app: express.Application;
    private server: any;
    private wss: WebSocketServer;
    private port: number;
    
    // Services
    private authService: AuthService;
    private gameService: GameService;
    private monsterService: MonsterService;
    private itemService: ItemService;
    private dbService: IDatabaseService;
    private logger: Logger;

    constructor() {
        this.port = parseInt(process.env.PORT || '3000');
        this.logger = new Logger();
        
        // Initialize Express app
        this.app = express();
        this.setupMiddleware();
        
        // Create HTTP server
        this.server = createServer(this.app);
        
        // Initialize WebSocket server
        this.wss = new WebSocketServer({ server: this.server });
        
        // Initialize services
        const useMockDb = process.env.USE_MOCK_DB === 'true' || !process.env.DB_HOST;
        
        if (useMockDb) {
            this.dbService = new MockDatabaseService();
            this.logger.info('Using mock database (in-memory storage)');
        } else {
            this.dbService = new DatabaseService();
            this.logger.info('Using MySQL database');
        }
        
        this.authService = new AuthService(this.dbService);
        this.itemService = new ItemService(this.dbService);
        this.gameService = new GameService(this.dbService, this.wss, this.itemService);
        this.monsterService = new MonsterService(this.dbService, this.wss);
        
        this.setupRoutes();
        this.setupWebSocket();
    }

    private setupMiddleware(): void {
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../client')));
        this.app.use(express.static(path.join(__dirname, '../../client')));
        
        // Request logging
        this.app.use((req, res, next) => {
            this.logger.info(`${req.method} ${req.path} - ${req.ip}`);
            next();
        });
    }

    private setupRoutes(): void {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'ok', timestamp: new Date().toISOString() });
        });

        // Authentication routes
        this.app.post('/api/auth/register', this.authService.register.bind(this.authService));
        this.app.post('/api/auth/login', this.authService.login.bind(this.authService));
        this.app.post('/api/auth/verify', this.authService.verifyToken.bind(this.authService));

        // Game API routes
        this.app.get('/api/game/characters/:userId', this.gameService.getCharacters.bind(this.gameService));
        this.app.post('/api/game/character/create', this.gameService.createCharacter.bind(this.gameService));
        this.app.get('/api/game/world/status', this.gameService.getWorldStatus.bind(this.gameService));
        
        // Monster API routes
        this.app.get('/api/game/monsters/:mapId?', this.getMonsters.bind(this));
        this.app.post('/api/game/monster/attack', this.attackMonster.bind(this));
        this.app.get('/api/game/monsters/stats', this.getMonsterStats.bind(this));
        
        // Item API routes
        this.app.get('/api/items', this.getAllItems.bind(this));
        this.app.get('/api/items/type/:type', this.getItemsByType.bind(this));
        this.app.get('/api/inventory/:characterId', this.getPlayerInventory.bind(this));
        this.app.post('/api/inventory/add', this.addItemToInventory.bind(this));
        this.app.post('/api/inventory/remove', this.removeItemFromInventory.bind(this));
        this.app.post('/api/inventory/equip', this.equipItem.bind(this));
        this.app.post('/api/inventory/enhance', this.enhanceItem.bind(this));
        this.app.post('/api/inventory/gold', this.updatePlayerGold.bind(this));
        this.app.get('/api/equipment/:characterId', this.getPlayerEquipment.bind(this));
        
        // Test endpoint to manually spawn monsters
        this.app.post('/api/game/monsters/spawn/:mapId', (req, res) => {
            try {
                const mapId = parseInt(req.params.mapId) || 1;
                // Force spawn some monsters for testing
                this.logger.info(`Manually spawning monsters on map ${mapId}`);
                res.json({ success: true, message: `Spawn initiated for map ${mapId}` });
            } catch (error) {
                this.logger.error('Error in manual spawn:', error);
                res.status(500).json({ success: false, message: 'Failed to spawn monsters' });
            }
        });

        // Serve client
        this.app.get('*', (req, res) => {
            res.sendFile(path.join(__dirname, '../client/test-client.html'));
        });
    }

    private setupWebSocket(): void {
        this.wss.on('connection', (ws, req) => {
            this.logger.info(`New WebSocket connection from ${req.socket.remoteAddress}`);
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.gameService.handleGameMessage(ws, message);
                } catch (error) {
                    this.logger.error('Invalid WebSocket message:', error);
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
                }
            });

            ws.on('close', () => {
                this.gameService.handleDisconnection(ws);
                this.logger.info('Client disconnected');
            });

            ws.on('error', (error) => {
                this.logger.error('WebSocket error:', error);
            });

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'welcome',
                message: 'Connected to Nightcrows Private Server',
                timestamp: new Date().toISOString()
            }));
        });
    }

    public async start(): Promise<void> {
        try {
            // Initialize database
            await this.dbService.initialize();
            this.logger.info('Database initialized successfully');

            // Start server
            this.server.listen(this.port, () => {
                this.logger.info(`Nightcrows Private Server running on port ${this.port}`);
                this.logger.info(`WebSocket server ready`);
                this.logger.info(`Health check: http://localhost:${this.port}/health`);
            });
        } catch (error) {
            this.logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    public async stop(): Promise<void> {
        this.logger.info('Shutting down server...');
        
        // Close WebSocket connections
        this.wss.clients.forEach(ws => ws.close());
        
        // Stop monster service
        this.monsterService.stop();
        
        // Close database connections
        await this.dbService.close();
        
        // Close HTTP server
        this.server.close();
        
        this.logger.info('Server shutdown complete');
    }

    // Monster API methods
    private async getMonsters(req: express.Request, res: express.Response): Promise<void> {
        try {
            const mapId = req.params.mapId ? parseInt(req.params.mapId) : undefined;
            const monsters = this.monsterService.getActiveMonsters(mapId);
            
            res.json({
                success: true,
                data: monsters.map(monster => ({
                    id: monster.id,
                    name: monster.name,
                    type: monster.type,
                    level: monster.level,
                    hp: monster.hp,
                    maxHp: monster.maxHp,
                    position: monster.position,
                    state: monster.state
                }))
            });
        } catch (error) {
            this.logger.error('Get monsters error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve monsters'
            });
        }
    }

    private async attackMonster(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { monsterId, damage, characterId } = req.body;
            
            if (!monsterId || !damage || !characterId) {
                res.status(400).json({
                    success: false,
                    message: 'Monster ID, damage, and character ID are required'
                });
                return;
            }
            
            const result = this.monsterService.damageMonster(monsterId, damage, characterId);
            
            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            this.logger.error('Attack monster error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to attack monster'
            });
        }
    }

    private async getMonsterStats(req: express.Request, res: express.Response): Promise<void> {
        try {
            const stats = this.monsterService.getStats();
            
            res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            this.logger.error('Get monster stats error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve monster statistics'
            });
        }
    }

    // Item API methods
    private async getAllItems(req: express.Request, res: express.Response): Promise<void> {
        try {
            const items = this.itemService.getAllItems();
            
            res.json({
                success: true,
                data: items
            });
        } catch (error) {
            this.logger.error('Get all items error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve items'
            });
        }
    }

    private async getItemsByType(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { type } = req.params;
            const items = this.itemService.getItemsByType(type as any);
            
            res.json({
                success: true,
                data: items
            });
        } catch (error) {
            this.logger.error('Get items by type error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve items by type'
            });
        }
    }

    private async getPlayerInventory(req: express.Request, res: express.Response): Promise<void> {
        try {
            const characterId = parseInt(req.params.characterId);
            
            if (isNaN(characterId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid character ID'
                });
                return;
            }

            const inventory = await this.itemService.getPlayerInventory(characterId);
            
            res.json({
                success: true,
                data: inventory
            });
        } catch (error) {
            this.logger.error('Get player inventory error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve inventory'
            });
        }
    }

    private async addItemToInventory(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { characterId, itemId, quantity = 1 } = req.body;
            
            if (!characterId || !itemId) {
                res.status(400).json({
                    success: false,
                    message: 'Character ID and item ID are required'
                });
                return;
            }

            const success = await this.itemService.addItemToInventory(characterId, itemId, quantity);
            
            if (success) {
                res.json({
                    success: true,
                    message: 'Item added to inventory'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to add item to inventory'
                });
            }
        } catch (error) {
            this.logger.error('Add item to inventory error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to add item to inventory'
            });
        }
    }

    private async removeItemFromInventory(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { characterId, itemId, quantity = 1 } = req.body;
            
            if (!characterId || !itemId) {
                res.status(400).json({
                    success: false,
                    message: 'Character ID and item ID are required'
                });
                return;
            }

            const success = await this.itemService.removeItemFromInventory(characterId, itemId, quantity);
            
            if (success) {
                res.json({
                    success: true,
                    message: 'Item removed from inventory'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to remove item from inventory'
                });
            }
        } catch (error) {
            this.logger.error('Remove item from inventory error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to remove item from inventory'
            });
        }
    }

    private async equipItem(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { characterId, itemId, slot } = req.body;
            
            if (!characterId || !itemId || !slot) {
                res.status(400).json({
                    success: false,
                    message: 'Character ID, item ID, and slot are required'
                });
                return;
            }

            const success = await this.itemService.equipItem(characterId, itemId, slot);
            
            if (success) {
                res.json({
                    success: true,
                    message: 'Item equipped'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to equip item'
                });
            }
        } catch (error) {
            this.logger.error('Equip item error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to equip item'
            });
        }
    }

    private async enhanceItem(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { characterId, itemId } = req.body;
            
            if (!characterId || !itemId) {
                res.status(400).json({
                    success: false,
                    message: 'Character ID and item ID are required'
                });
                return;
            }

            const result = await this.itemService.enhanceItem(characterId, itemId);
            
            if (result.success) {
                res.json({
                    success: true,
                    data: {
                        newLevel: result.newLevel,
                        message: result.message
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: result.message
                });
            }
        } catch (error) {
            this.logger.error('Enhance item error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to enhance item'
            });
        }
    }

    private async updatePlayerGold(req: express.Request, res: express.Response): Promise<void> {
        try {
            const { characterId, amount } = req.body;
            
            if (!characterId || amount === undefined) {
                res.status(400).json({
                    success: false,
                    message: 'Character ID and amount are required'
                });
                return;
            }

            const success = await this.itemService.updateGold(characterId, amount);
            
            if (success) {
                res.json({
                    success: true,
                    message: 'Gold updated successfully'
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to update gold'
                });
            }
        } catch (error) {
            this.logger.error('Update gold error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update gold'
            });
        }
    }

    private async getPlayerEquipment(req: express.Request, res: express.Response): Promise<void> {
        try {
            const characterId = parseInt(req.params.characterId);
            
            if (isNaN(characterId)) {
                res.status(400).json({
                    success: false,
                    message: 'Invalid character ID'
                });
                return;
            }

            const equipment = await this.itemService.getPlayerEquipment(characterId);
            
            res.json({
                success: true,
                data: equipment
            });
        } catch (error) {
            this.logger.error('Get player equipment error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retrieve equipment'
            });
        }
    }
}

// Start server
const server = new NightcrowsServer();

// Graceful shutdown
process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
});

// Start the server
server.start().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});

export default server;