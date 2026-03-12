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

// Daily Queue Reset Middleware - Serverless Compatible
let hasCheckedInitialDate = false;
let lastResetDate = new Date().getDate();

app.use(async (req, res, next) => {
    const today = new Date();
    const currentDay = today.getDate();

    // We need to check the DB if:
    // 1. The day has changed while server is running.
    // 2. Or this is a cold start (we haven't checked yet).
    if (currentDay !== lastResetDate || !hasCheckedInitialDate) {
        lastResetDate = currentDay;
        hasCheckedInitialDate = true;

        try {
            const startOfToday = new Date(today);
            startOfToday.setHours(0, 0, 0, 0);

            // Check if there are ANY waiting or in_service tickets from BEFORE today
            const oldTicketsExist = await prisma.visit.findFirst({
                where: {
                    ticketStatus: { in: ['WAITING', 'IN_SERVICE'] },
                    timestamp: { lt: startOfToday }
                }
            });

            if (oldTicketsExist) {
                console.log('[Daily Reset] Pendências de dias anteriores encontradas. Executando limpeza...');

                // 1. Expire old pending tickets
                await prisma.visit.updateMany({
                    where: {
                        ticketStatus: { in: ['WAITING', 'IN_SERVICE'] },
                        timestamp: { lt: startOfToday }
                    },
                    data: { ticketStatus: 'EXPIRED' }
                });

                // 2. Recalculate queue count for all sectors based on TODAY's WAITING tickets
                const sectors = await prisma.sector.findMany();
                for (const sector of sectors) {
                    const actualQueueCount = await prisma.visit.count({
                        where: {
                            sectorId: sector.id,
                            ticketStatus: 'WAITING',
                            timestamp: { gte: startOfToday }
                        }
                    });

                    await prisma.sector.update({
                        where: { id: sector.id },
                        data: { queueCount: actualQueueCount }
                    });
                }

                console.log('[Daily Reset] Filas zeradas e recalibradas perfeitamente para o dia de hoje.');
                io.emit('queue_reset');
            }
        } catch (error) {
            console.error('[Daily Reset] Erro:', error);
            // On failure, allow re-check next time to ensure consistency
            hasCheckedInitialDate = false;
        }
    }
    next();
});

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

// --- RECEPTION CITIEN/VISIT ROUTES --- //

app.get('/api/citizens/:cpf', authenticateToken, async (req, res) => {
    try {
        const cpf = req.params.cpf as string;
        const citizen = await prisma.citizen.findUnique({
            where: { cpf }
        });
        if (!citizen) return res.status(404).json({ error: 'Citizen not found' });
        res.json(citizen);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch citizen' });
    }
});

app.post('/api/visits', authenticateToken, async (req, res) => {
    try {
        const { cpf, name, phone, sectorId } = req.body;
        const userId = (req as any).user.id;

        // Verify sector is not AWAY
        const sector = await prisma.sector.findUnique({ where: { id: sectorId } });
        if (!sector) return res.status(404).json({ error: 'Sector not found' });
        if (sector.status === 'AWAY') {
            return res.status(400).json({ error: 'Setor ausente. Não é possível adicionar à fila.' });
        }

        // Create or find citizen
        const citizen = await prisma.citizen.upsert({
            where: { cpf },
            update: { name, phone },
            create: { cpf, name, phone }
        });

        // Generate unique ticket code with sector prefix
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        // Count visits today FOR THIS SECTOR specifically
        const todayCount = await prisma.visit.count({
            where: {
                timestamp: { gte: startOfDay },
                sectorId: sectorId
            }
        });

        // Extract up to 3 letters from sector name for the prefix
        const prefix = sector.name
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-zA-Z]/g, '') // remove non-letters
            .substring(0, 3)
            .toUpperCase() || 'GER'; // fallback to GER if no letters

        const ticketNum = todayCount + 1;
        const code = `${prefix}-${String(ticketNum).padStart(3, '0')}`;

        // Create visit
        const visit = await prisma.visit.create({
            data: {
                code,
                citizenId: citizen.cpf,
                sectorId,
                userId,
                ticketStatus: 'WAITING'
            },
            include: { citizen: true, sector: true }
        });

        // Increment queue count
        await prisma.sector.update({
            where: { id: sectorId },
            data: { queueCount: { increment: 1 } }
        });

        res.status(201).json(visit);
    } catch (error) {
        console.error('Error creating visit:', error);
        res.status(500).json({ error: 'Failed to create visit' });
    }
});

app.get('/api/visits', authenticateToken, async (req, res) => {
    try {
        const { date, filterType, code, cpf, sectorId, ticketStatus } = req.query;

        let queryOptions: any = {
            include: {
                citizen: true,
                sector: true,
                user: { select: { email: true } }
            },
            orderBy: { timestamp: 'desc' },
            where: {}
        };

        if (sectorId) {
            queryOptions.where.sectorId = sectorId as string;
        }

        if (ticketStatus) {
            queryOptions.where.ticketStatus = ticketStatus as string;
        }

        // Search by ticket code
        if (code) {
            queryOptions.where.code = { contains: code as string, mode: 'insensitive' };
            const visits = await prisma.visit.findMany(queryOptions);
            return res.json(visits);
        }

        // Search by CPF
        if (cpf) {
            queryOptions.where.citizenId = { contains: cpf as string };
            const visits = await prisma.visit.findMany(queryOptions);
            return res.json(visits);
        }

        if (date && filterType) {
            const targetDate = new Date(date as string);
            let startDate = new Date(targetDate);
            let endDate = new Date(targetDate);

            if (filterType === 'day') {
                startDate.setHours(0, 0, 0, 0);
                endDate.setHours(23, 59, 59, 999);
            } else if (filterType === 'week') {
                const day = startDate.getDay();
                startDate.setDate(startDate.getDate() - day);
                startDate.setHours(0, 0, 0, 0);
                endDate.setDate(endDate.getDate() + (6 - day));
                endDate.setHours(23, 59, 59, 999);
            } else if (filterType === 'month') {
                startDate.setDate(1);
                startDate.setHours(0, 0, 0, 0);
                endDate.setMonth(endDate.getMonth() + 1);
                endDate.setDate(0);
                endDate.setHours(23, 59, 59, 999);
            } else if (filterType === 'custom') {
                const customStart = req.query.startDate as string;
                const customEnd = req.query.endDate as string;
                if (customStart && customEnd) {
                    startDate = new Date(customStart + 'T00:00:00');
                    endDate = new Date(customEnd + 'T23:59:59.999');
                }
            }
            queryOptions.where.timestamp = { gte: startDate, lte: endDate };
        } else if (!code && !cpf && !ticketStatus) {
            // Only strictly default to today if we aren't specifically searching by code, cpf or fetching an active ticket
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            queryOptions.where.timestamp = { gte: todayStart, lte: todayEnd };
        }

        const visits = await prisma.visit.findMany(queryOptions);
        res.json(visits);
    } catch (error: any) {
        console.error('Error fetching visits:', error);
        res.status(500).json({
            error: 'Failed to fetch visits',
            details: error.message,
            hint: 'Provavelmente existem registros antigos com a coluna "code" vazia (NULL) no banco de dados. Rode o script de limpeza no SQL Editor do Supabase.'
        });
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

// --- CALL NEXT & CHECKOUT ---

app.post('/api/sectors/:id/call-next', authenticateToken, async (req, res) => {
    try {
        const sectorId = req.params.id as string;

        // Get next WAITING visit in FIFO order (only from TODAY)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const nextVisit = await prisma.visit.findFirst({
            where: {
                sectorId,
                ticketStatus: 'WAITING',
                timestamp: { gte: startOfToday }
            },
            orderBy: { timestamp: 'asc' },
            include: { citizen: true, sector: true }
        });

        if (!nextVisit) {
            return res.status(404).json({ error: 'Nenhum cidadão aguardando na fila.' });
        }

        // Update visit status to IN_SERVICE
        const updatedVisit = await prisma.visit.update({
            where: { id: nextVisit.id },
            data: { ticketStatus: 'IN_SERVICE' },
            include: { citizen: true, sector: true }
        });

        res.json(updatedVisit);
    } catch (error) {
        console.error('Error calling next:', error);
        res.status(500).json({ error: 'Failed to call next' });
    }
});

app.patch('/api/visits/:code/checkout', authenticateToken, async (req, res) => {
    try {
        const code = req.params.code as string;

        const visit = await prisma.visit.findUnique({
            where: { code },
            include: { sector: true }
        });

        if (!visit) return res.status(404).json({ error: 'Ticket não encontrado.' });
        if (visit.ticketStatus === 'FINISHED') {
            return res.status(400).json({ error: 'Ticket já finalizado.' });
        }

        // Mark as finished
        const updated = await prisma.visit.update({
            where: { code },
            data: { ticketStatus: 'FINISHED' }
        });

        // Decrement sector queue
        await prisma.sector.update({
            where: { id: visit.sectorId },
            data: { queueCount: { decrement: 1 } }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error checkout:', error);
        res.status(500).json({ error: 'Failed to checkout' });
    }
});

// --- SECTOR STATUS & QUEUE REST ENDPOINTS ---

app.patch('/api/sectors/:id/status', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id as string;
        const { status } = req.body;

        const updatedSector = await prisma.sector.update({
            where: { id },
            data: { status },
        });

        res.json(updatedSector);
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

app.patch('/api/sectors/:id/queue', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id as string;
        const { action } = req.body; // 'add' | 'remove'

        const currentSector = await prisma.sector.findUnique({ where: { id } });
        if (!currentSector) return res.status(404).json({ error: 'Sector not found' });

        let newCount = currentSector.queueCount;
        if (action === 'add') {
            newCount++;
        } else if (action === 'remove' && newCount > 0) {
            newCount--;
        }

        const updatedSector = await prisma.sector.update({
            where: { id },
            data: { queueCount: newCount },
        });

        res.json(updatedSector);
    } catch (error) {
        console.error('Error updating queue:', error);
        res.status(500).json({ error: 'Failed to update queue' });
    }
});

// Socket.io for Real-Time Status Updates (legacy - kept for reference)
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
