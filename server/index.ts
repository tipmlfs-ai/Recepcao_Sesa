import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

const prisma = new PrismaClient();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API Routes
app.get('/', (req, res) => {
    res.send(`
        <html>
            <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column;">
                <h1>O servidor backend está rodando corretamente! ✅</h1>
                <p>Esta é a porta do <b>backend</b> (3001). A interface do usuário não fica aqui.</p>
                <a href="http://localhost:5173" style="padding: 10px 20px; background: #0f172a; color: white; text-decoration: none; border-radius: 8px; margin-top: 20px;">
                    Acessar o Painel Front-End (localhost:5173)
                </a>
            </body>
        </html>
    `);
});

app.get('/api/sectors', async (req, res) => {
    try {
        const sectors = await prisma.sector.findMany({
            orderBy: { name: 'asc' },
        });
        res.json(sectors);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sectors' });
    }
});

app.get('/api/sectors/:id', async (req, res) => {
    try {
        const sector = await prisma.sector.findUnique({
            where: { id: req.params.id },
            include: { user: true } // Include user when getting single sector just in case
        });
        if (!sector) {
            return res.status(404).json({ error: 'Sector not found' });
        }
        res.json(sector);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sector' });
    }
});

// Middleware for JWT Verification
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access denied. No token provided.' });

    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
        if (err) return res.status(403).json({ error: 'Invalid token.' });
        (req as any).user = decodedUser;
        next();
    });
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role;
    if (userRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required.' });
    }
    next();
};

// --- AUTHENTICATION ROUTES --- //

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({
            where: { email },
            include: { sector: true } // Include linked sector config
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate token payload
        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
            sectorId: user.sectorId,
            sectorName: user.sector?.name
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

        // Remove password from response
        const { password: _, ...userSafe } = user;
        res.json({ token, user: { ...userSafe, sectorName: user.sector?.name } });

    } catch (error) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

// --- ADMIN USERS ROUTES --- //

app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, role: true, sectorId: true, createdAt: true, sector: { select: { name: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { email, password, role, sectorId } = req.body;

        // Verify if email already exists
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) return res.status(400).json({ error: 'Email already taken' });

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role,
                sectorId: sectorId || null
            },
            select: { id: true, email: true, role: true, sectorId: true, sector: { select: { name: true } } }
        });

        res.status(201).json(newUser);
    } catch (error) {
        console.error("Create User Error:", error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = req.params.id as string;
        const { adminPassword } = req.body;

        // Prevent deleting yourself
        if (id === (req as any).user.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        if (!adminPassword) {
            return res.status(400).json({ error: 'Senha de administrador é obrigatória para esta ação' });
        }

        // Verify Admin Password
        const adminUser = await prisma.user.findUnique({ where: { id: (req as any).user.id } });
        if (!adminUser) return res.status(401).json({ error: 'Administrador não encontrado' });

        const isPasswordValid = await bcrypt.compare(adminPassword, adminUser.password);
        if (!isPasswordValid) return res.status(403).json({ error: 'Senha de administrador incorreta' });

        await prisma.user.delete({ where: { id } });
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

app.patch('/api/users/:id/password', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = req.params.id as string;
        const { newPassword, adminPassword } = req.body;

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: 'Nova senha inválida' });
        }

        if (!adminPassword) {
            return res.status(400).json({ error: 'Senha de administrador é obrigatória' });
        }

        // Verify Admin Password
        const adminUser = await prisma.user.findUnique({ where: { id: (req as any).user.id } });
        if (!adminUser) return res.status(401).json({ error: 'Administrador não encontrado' });

        const isPasswordValid = await bcrypt.compare(adminPassword, adminUser.password);
        if (!isPasswordValid) return res.status(403).json({ error: 'Senha de administrador incorreta' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({
            where: { id },
            data: { password: hashedPassword }
        });

        res.json({ message: 'Senha atualizada com sucesso' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user password' });
    }
});

// Socket.io for Real-Time Status Updates
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // When a controller updates the status
    socket.on('update_status', async (data) => {
        try {
            const { sectorId, status } = data;

            const updatedSector = await prisma.sector.update({
                where: { id: sectorId },
                data: { status },
            });

            // Broadcast the change to ALL connected clients (especially the Reception Dashboard)
            io.emit('status_changed', updatedSector);

            console.log(`[Status Updated] ${updatedSector.name} -> ${updatedSector.status}`);
        } catch (error) {
            console.error('Error updating status:', error);
            socket.emit('error', { message: 'Failed to update status' });
        }
    });

    // When reception updates the queue count
    socket.on('update_queue', async (data) => {
        try {
            const { sectorId, action } = data;

            const currentSector = await prisma.sector.findUnique({
                where: { id: sectorId },
            });

            if (!currentSector) return;

            let newCount = currentSector.queueCount;
            if (action === 'add') {
                newCount++;
            } else if (action === 'remove' && newCount > 0) {
                newCount--;
            } else {
                return; // Do nothing if it's below 0 or unsupported action
            }

            const updatedSector = await prisma.sector.update({
                where: { id: sectorId },
                data: { queueCount: newCount },
            });

            // Re-use status_changed to push the entire row update
            io.emit('status_changed', updatedSector);

            console.log(`[Queue Updated] ${updatedSector.name} -> Queue: ${updatedSector.queueCount}`);
        } catch (error) {
            console.error('Error updating queue:', error);
            socket.emit('error', { message: 'Failed to update queue' });
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

httpServer.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
