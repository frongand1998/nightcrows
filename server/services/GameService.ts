import { Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { IDatabaseService, Character } from '../database/IDatabaseService';
import { Logger } from '../utils/Logger';
import { ItemService } from './ItemService';

export interface GameMessage {
    type: string;
    data?: any;
    timestamp?: string;
}

export interface PlayerSession {
    ws: WebSocket;
    userId: number;
    characterId?: number;
    character?: Character;
    lastActivity: Date;
}

export interface WorldStatus {
    playersOnline: number;
    totalCharacters: number;
    serverUptime: number;
    mapInstances: number;
}

export class GameService {
    private db: IDatabaseService;
    private wss: WebSocketServer;
    private itemService: ItemService;
    private logger: Logger;
    private activeSessions: Map<WebSocket, PlayerSession>;
    private serverStartTime: Date;

    // Game constants
    private readonly STARTING_STATS = {
        Warrior: { hp: 150, mp: 50, strength: 15, dexterity: 10, intelligence: 8 },
        Mage: { hp: 80, mp: 120, strength: 8, dexterity: 10, intelligence: 15 },
        Archer: { hp: 100, mp: 80, strength: 10, dexterity: 15, intelligence: 10 },
        Assassin: { hp: 90, mp: 70, strength: 12, dexterity: 15, intelligence: 8 }
    };

    private readonly STARTING_POSITION = { x: 100, y: 100, mapId: 1 };

    constructor(databaseService: IDatabaseService, webSocketServer: WebSocketServer, itemService: ItemService) {
        this.db = databaseService;
        this.wss = webSocketServer;
        this.itemService = itemService;
        this.logger = new Logger();
        this.activeSessions = new Map();
        this.serverStartTime = new Date();

        // Clean up inactive sessions every 5 minutes
        setInterval(() => {
            this.cleanupInactiveSessions();
        }, 5 * 60 * 1000);
    }

    // HTTP API Methods
    public async getCharacters(req: Request, res: Response): Promise<void> {
        try {
            const userId = parseInt(req.params.userId);
            
            if (isNaN(userId)) {
                res.status(400).json({ 
                    success: false, 
                    message: 'Invalid user ID' 
                });
                return;
            }

            const characters = await this.db.getCharactersByUserId(userId);
            
            res.json({
                success: true,
                data: characters.map((char: Character) => ({
                    id: char.id,
                    name: char.name,
                    class: char.class,
                    level: char.level,
                    experience: char.experience,
                    hp: char.hp,
                    mp: char.mp,
                    strength: char.strength,
                    dexterity: char.dexterity,
                    intelligence: char.intelligence,
                    position: {
                        x: char.x_position,
                        y: char.y_position,
                        mapId: char.map_id
                    },
                    createdAt: char.created_at
                }))
            });

        } catch (error) {
            this.logger.error('Get characters error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to retrieve characters' 
            });
        }
    }

    public async createCharacter(req: Request, res: Response): Promise<void> {
        try {
            const { userId, name, characterClass } = req.body;

            // Validation
            if (!userId || !name || !characterClass) {
                res.status(400).json({ 
                    success: false, 
                    message: 'User ID, name, and character class are required' 
                });
                return;
            }

            if (!['Warrior', 'Mage', 'Archer', 'Assassin'].includes(characterClass)) {
                res.status(400).json({ 
                    success: false, 
                    message: 'Invalid character class' 
                });
                return;
            }

            if (name.length < 3 || name.length > 20) {
                res.status(400).json({ 
                    success: false, 
                    message: 'Character name must be between 3 and 20 characters' 
                });
                return;
            }

            // Check if character name already exists
            const existingChar = await this.db.getCharacterById(0); // This would need a different method
            
            // Get starting stats for the class
            const startingStats = this.STARTING_STATS[characterClass as keyof typeof this.STARTING_STATS];
            
            // Create character
            const characterData = {
                user_id: userId,
                name,
                class: characterClass,
                level: 1,
                experience: 0,
                ...startingStats,
                x_position: this.STARTING_POSITION.x,
                y_position: this.STARTING_POSITION.y,
                map_id: this.STARTING_POSITION.mapId
            };

            const characterId = await this.db.createCharacter(characterData);

            // Add starter items for the new character
            await this.itemService.addStarterItems(characterId, characterClass);

            this.logger.info(`New character created: ${name} (${characterClass}) for user ${userId}`);

            res.status(201).json({
                success: true,
                message: 'Character created successfully',
                data: {
                    id: characterId,
                    ...characterData
                }
            });

        } catch (error) {
            this.logger.error('Create character error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to create character' 
            });
        }
    }

    public async getWorldStatus(req: Request, res: Response): Promise<void> {
        try {
            const status: WorldStatus = {
                playersOnline: this.activeSessions.size,
                totalCharacters: 0, // Would need a count query
                serverUptime: Date.now() - this.serverStartTime.getTime(),
                mapInstances: 1 // Simplified for now
            };

            res.json({
                success: true,
                data: status
            });

        } catch (error) {
            this.logger.error('Get world status error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Failed to retrieve world status' 
            });
        }
    }

    // WebSocket Game Message Handlers
    public async handleGameMessage(ws: WebSocket, message: GameMessage): Promise<void> {
        try {
            const session = this.activeSessions.get(ws);
            
            switch (message.type) {
                case 'authenticate':
                    await this.handleAuthentication(ws, message.data);
                    break;
                    
                case 'select_character':
                    await this.handleCharacterSelection(ws, message.data);
                    break;
                    
                case 'move':
                    await this.handleMovement(ws, message.data);
                    break;
                    
                case 'chat':
                    await this.handleChat(ws, message.data);
                    break;
                    
                case 'ping':
                    this.sendMessage(ws, { type: 'pong', timestamp: new Date().toISOString() });
                    break;
                    
                default:
                    this.logger.warn(`Unknown message type: ${message.type}`);
                    this.sendMessage(ws, { 
                        type: 'error', 
                        data: { message: 'Unknown message type' } 
                    });
            }

            // Update last activity
            if (session) {
                session.lastActivity = new Date();
            }

        } catch (error) {
            this.logger.error('Game message handling error:', error);
            this.sendMessage(ws, { 
                type: 'error', 
                data: { message: 'Internal server error' } 
            });
        }
    }

    private async handleAuthentication(ws: WebSocket, data: any): Promise<void> {
        const { userId } = data;
        
        if (!userId) {
            this.sendMessage(ws, { 
                type: 'auth_failed', 
                data: { message: 'User ID required' } 
            });
            return;
        }

        // Create or update session
        const session: PlayerSession = {
            ws,
            userId,
            lastActivity: new Date()
        };

        this.activeSessions.set(ws, session);
        
        this.logger.info(`Player authenticated: User ${userId}`);
        
        this.sendMessage(ws, { 
            type: 'authenticated', 
            data: { userId } 
        });
    }

    private async handleCharacterSelection(ws: WebSocket, data: any): Promise<void> {
        const session = this.activeSessions.get(ws);
        if (!session) {
            this.sendMessage(ws, { 
                type: 'error', 
                data: { message: 'Not authenticated' } 
            });
            return;
        }

        const { characterId } = data;
        const character = await this.db.getCharacterById(characterId);
        
        if (!character || character.user_id !== session.userId) {
            this.sendMessage(ws, { 
                type: 'character_select_failed', 
                data: { message: 'Invalid character' } 
            });
            return;
        }

        session.characterId = characterId;
        session.character = character;

        this.logger.info(`Character selected: ${character.name} (ID: ${characterId})`);

        this.sendMessage(ws, { 
            type: 'character_selected', 
            data: {
                character: {
                    id: character.id,
                    name: character.name,
                    class: character.class,
                    level: character.level,
                    position: {
                        x: character.x_position,
                        y: character.y_position,
                        mapId: character.map_id
                    }
                }
            }
        });

        // Broadcast to other players that this character entered the world
        this.broadcastToMap(character.map_id, {
            type: 'player_entered',
            data: {
                characterId: character.id,
                name: character.name,
                position: {
                    x: character.x_position,
                    y: character.y_position
                }
            }
        }, ws);
    }

    private async handleMovement(ws: WebSocket, data: any): Promise<void> {
        const session = this.activeSessions.get(ws);
        if (!session || !session.character) {
            this.sendMessage(ws, { 
                type: 'error', 
                data: { message: 'No character selected' } 
            });
            return;
        }

        const { x, y, mapId } = data;
        
        // Basic validation (in a real game, you'd validate movement properly)
        if (typeof x !== 'number' || typeof y !== 'number') {
            return;
        }

        // Update character position in database
        await this.db.updateCharacterPosition(session.character.id, x, y, mapId);
        
        // Update session character data
        session.character.x_position = x;
        session.character.y_position = y;
        if (mapId !== undefined) {
            session.character.map_id = mapId;
        }

        // Broadcast movement to other players on the same map
        this.broadcastToMap(session.character.map_id, {
            type: 'player_moved',
            data: {
                characterId: session.character.id,
                position: { x, y }
            }
        }, ws);
    }

    private async handleChat(ws: WebSocket, data: any): Promise<void> {
        const session = this.activeSessions.get(ws);
        if (!session || !session.character) {
            return;
        }

        const { message, channel = 'global' } = data;
        
        if (!message || typeof message !== 'string' || message.length > 500) {
            return;
        }

        const chatData = {
            type: 'chat_message',
            data: {
                channel,
                characterName: session.character.name,
                message,
                timestamp: new Date().toISOString()
            }
        };

        // Broadcast based on channel
        switch (channel) {
            case 'global':
                this.broadcast(chatData);
                break;
            case 'map':
                this.broadcastToMap(session.character.map_id, chatData);
                break;
            default:
                this.sendMessage(ws, chatData); // Echo back for unknown channels
        }
    }

    public handleDisconnection(ws: WebSocket): void {
        const session = this.activeSessions.get(ws);
        
        if (session) {
            this.logger.info(`Player disconnected: User ${session.userId}${session.character ? ` (${session.character.name})` : ''}`);
            
            // Broadcast to other players if character was in world
            if (session.character) {
                this.broadcastToMap(session.character.map_id, {
                    type: 'player_left',
                    data: {
                        characterId: session.character.id,
                        name: session.character.name
                    }
                }, ws);
            }
            
            this.activeSessions.delete(ws);
        }
    }

    private sendMessage(ws: WebSocket, message: GameMessage): void {
        if (ws.readyState === WebSocket.OPEN) {
            message.timestamp = new Date().toISOString();
            ws.send(JSON.stringify(message));
        }
    }

    private broadcast(message: GameMessage): void {
        message.timestamp = new Date().toISOString();
        const messageStr = JSON.stringify(message);
        
        this.activeSessions.forEach((session) => {
            if (session.ws.readyState === WebSocket.OPEN) {
                session.ws.send(messageStr);
            }
        });
    }

    private broadcastToMap(mapId: number, message: GameMessage, excludeWs?: WebSocket): void {
        message.timestamp = new Date().toISOString();
        const messageStr = JSON.stringify(message);
        
        this.activeSessions.forEach((session) => {
            if (session.ws !== excludeWs && 
                session.character && 
                session.character.map_id === mapId &&
                session.ws.readyState === WebSocket.OPEN) {
                session.ws.send(messageStr);
            }
        });
    }

    private cleanupInactiveSessions(): void {
        const now = new Date();
        const timeout = 10 * 60 * 1000; // 10 minutes

        this.activeSessions.forEach((session, ws) => {
            if (now.getTime() - session.lastActivity.getTime() > timeout) {
                this.logger.info(`Cleaning up inactive session for user ${session.userId}`);
                ws.close();
                this.activeSessions.delete(ws);
            }
        });
    }
}
