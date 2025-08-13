import { Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import { IDatabaseService } from '../database/IDatabaseService';
import { Logger } from '../utils/Logger';

export interface JWTPayload {
    userId: number;
    username: string;
    iat?: number;
    exp?: number;
}

export class AuthService {
    private db: IDatabaseService;
    private logger: Logger;
    private jwtSecret: string;

    constructor(databaseService: IDatabaseService) {
        this.db = databaseService;
        this.logger = new Logger();
        this.jwtSecret = process.env.JWT_SECRET || 'nightcrows-secret-key-change-in-production';
        
        if (!process.env.JWT_SECRET) {
            this.logger.warn('JWT_SECRET not set in environment variables, using default (not secure for production)');
        }
    }

    public async register(req: Request, res: Response): Promise<void> {
        try {
            const { username, email, password } = req.body;

            // Validation
            if (!username || !email || !password) {
                res.status(400).json({ 
                    success: false, 
                    message: 'Username, email, and password are required' 
                });
                return;
            }

            if (username.length < 3 || username.length > 20) {
                res.status(400).json({ 
                    success: false, 
                    message: 'Username must be between 3 and 20 characters' 
                });
                return;
            }

            if (password.length < 6) {
                res.status(400).json({ 
                    success: false, 
                    message: 'Password must be at least 6 characters long' 
                });
                return;
            }

            // Check if user already exists
            const existingUser = await this.db.getUserByUsername(username);
            if (existingUser) {
                res.status(409).json({ 
                    success: false, 
                    message: 'Username already exists' 
                });
                return;
            }

            // Hash password
            const saltRounds = 12;
            const passwordHash = await bcrypt.hash(password, saltRounds);

            // Create user
            const userId = await this.db.createUser(username, email, passwordHash);

            // Generate JWT token
            const token = this.generateToken(userId, username);

            this.logger.info(`New user registered: ${username} (ID: ${userId})`);

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: {
                    userId,
                    username,
                    email,
                    token
                }
            });

        } catch (error) {
            this.logger.error('Registration error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Internal server error during registration' 
            });
        }
    }

    public async login(req: Request, res: Response): Promise<void> {
        try {
            const { username, password } = req.body;

            // Validation
            if (!username || !password) {
                res.status(400).json({ 
                    success: false, 
                    message: 'Username and password are required' 
                });
                return;
            }

            // Get user from database
            const user = await this.db.getUserByUsername(username);
            if (!user) {
                res.status(401).json({ 
                    success: false, 
                    message: 'Invalid username or password' 
                });
                return;
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(password, user.password_hash);
            if (!isPasswordValid) {
                res.status(401).json({ 
                    success: false, 
                    message: 'Invalid username or password' 
                });
                return;
            }

            // Update last login
            await this.db.updateLastLogin(user.id);

            // Generate JWT token
            const token = this.generateToken(user.id, user.username);

            this.logger.info(`User logged in: ${username} (ID: ${user.id})`);

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    userId: user.id,
                    username: user.username,
                    email: user.email,
                    token,
                    lastLogin: user.last_login
                }
            });

        } catch (error) {
            this.logger.error('Login error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Internal server error during login' 
            });
        }
    }

    public async verifyToken(req: Request, res: Response): Promise<void> {
        try {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

            if (!token) {
                res.status(401).json({ 
                    success: false, 
                    message: 'Access token required' 
                });
                return;
            }

            // Verify JWT token
            const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
            
            // Get user from database to ensure they still exist
            const user = await this.db.getUserById(decoded.userId);
            if (!user) {
                res.status(401).json({ 
                    success: false, 
                    message: 'Invalid token - user not found' 
                });
                return;
            }

            res.json({
                success: true,
                message: 'Token is valid',
                data: {
                    userId: user.id,
                    username: user.username,
                    email: user.email
                }
            });

        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                res.status(401).json({ 
                    success: false, 
                    message: 'Invalid token' 
                });
                return;
            }

            this.logger.error('Token verification error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Internal server error during token verification' 
            });
        }
    }

    public verifyTokenMiddleware = async (req: any, res: Response, next: any): Promise<void> => {
        try {
            const authHeader = req.headers.authorization;
            const token = authHeader && authHeader.split(' ')[1];

            if (!token) {
                res.status(401).json({ 
                    success: false, 
                    message: 'Access token required' 
                });
                return;
            }

            const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
            const user = await this.db.getUserById(decoded.userId);
            
            if (!user) {
                res.status(401).json({ 
                    success: false, 
                    message: 'Invalid token - user not found' 
                });
                return;
            }

            // Attach user info to request
            req.user = {
                id: user.id,
                username: user.username,
                email: user.email
            };

            next();

        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                res.status(401).json({ 
                    success: false, 
                    message: 'Invalid token' 
                });
                return;
            }

            this.logger.error('Middleware token verification error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Internal server error' 
            });
        }
    };

    private generateToken(userId: number, username: string): string {
        const payload = { userId, username };
        return jwt.sign(payload, this.jwtSecret, { expiresIn: '24h' });
    }

    public decodeToken(token: string): JWTPayload | null {
        try {
            return jwt.verify(token, this.jwtSecret) as JWTPayload;
        } catch (error) {
            return null;
        }
    }
}
