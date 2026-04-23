import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import exportRoutes from './exportRoutes';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-change-in-production';
const app = express();
const dbUrl = process.env.DATABASE_URL || '';
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: dbUrl.includes('pool_timeout') ? dbUrl : `${dbUrl}&pool_timeout=60`
        }
    }
});
if (dbUrl.includes(':6543') && !dbUrl.includes('pgbouncer=true')) {
    console.error(' [CRÍTICO] DATABASE_URL está usando a porta do pooler (6543) mas está faltando "?pgbouncer=true".');
    console.warn(' Isso causará erros de "prepared statement already exists" (42P05) em produção.');
}

// Log connection string (masked) to help verify Vercel environment
const maskedUrl = dbUrl.replace(/:([^@]+)@/, ':****@');
console.log(`[Database] Conectando ao banco de dados: ${maskedUrl}`);

// Helper to reset date to start of day
function todayReset(d: Date) {
    d.setHours(0, 0, 0, 0);
    return d;
}

app.use(cors());
app.use(express.json());

// Daily Queue Reset Middleware - Serverless Compatible
app.use(async (req, res, next) => {
    const today = new Date();
    const currentDayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // We use a string comparison for the date to avoid time-zone issues in serverless
    if (globalThis.lastResetDateStr !== currentDayStr) {
        globalThis.lastResetDateStr = currentDayStr;

        try {
            const startOfToday = new Date(today);
            startOfToday.setHours(0, 0, 0, 0);

            // Check if there are ANY waiting or in_service tickets from BEFORE today
            const oldTicketsExist = await prisma.visit.findFirst({
                where: {
                    ticketStatus: { in: ['WAITING', 'IN_SERVICE', 'NO_SHOW', 'IN_WAITING_ROOM'] },
                    timestamp: { lt: startOfToday }
                }
            });

            if (oldTicketsExist) {
                console.log(`[Daily Reset] [${currentDayStr}] Pendências de dias anteriores encontradas. Executando limpeza...`);

                // 1. Expire old pending tickets
                await prisma.visit.updateMany({
                    where: {
                        ticketStatus: { in: ['WAITING', 'IN_SERVICE', 'NO_SHOW', 'IN_WAITING_ROOM'] },
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
            } else {
                 console.log(`[Daily Reset] [${currentDayStr}] Fila já está limpa para hoje.`);
            }
        } catch (error) {
            console.error('[Daily Reset] Erro:', error);
            // On failure, reset the global check so it tries again on next request
            globalThis.lastResetDateStr = '';
        }
    }
    next();
});

// Polyfill for globalThis in older node versions if needed, but modern node (Vercel) supports it.
declare global {
    var lastResetDateStr: string;
}

// Middleware for JWT Verification
const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined') {
        return res.status(401).json({ error: 'Access denied. Token missing or invalid (null/undefined).' });
    }

    jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
        if (err) {
            console.error('[Auth] JWT Verify Error:', err.message);
            return res.status(403).json({ error: 'Invalid token.', details: err.message });
        }
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
            include: { resources: true }
        });
        res.json(sectors);
    } catch (error: any) {
        res.status(500).json({ error: 'Failed to fetch sectors', details: error.message, stack: error.stack });
    }
});

app.get('/api/sectors/:id', async (req, res) => {
    try {
        const sector = await prisma.sector.findUnique({
            where: { id: req.params.id },
            include: { user: true, resources: true } // Include user and resources
        });
        if (!sector) {
            return res.status(404).json({ error: 'Sector not found' });
        }
        res.json(sector);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch sector' });
    }
});

// --- RESOURCE MANAGEMENT ROUTES --- //

app.post('/api/sectors/:id/resources', authenticateToken, async (req, res) => {
    try {
        const sectorId = req.params.id as string;
        const { name } = req.body;

        const resource = await prisma.resource.create({
            data: { name, sectorId }
        });
        res.status(201).json(resource);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create resource' });
    }
});

app.delete('/api/resources/:id', authenticateToken, async (req, res) => {
    try {
        const id = req.params.id as string;

        // Block deletion if there are active visits for this resource
        const activeVisits = await prisma.visit.findFirst({
            where: {
                resourceId: id,
                ticketStatus: { in: ['WAITING', 'IN_WAITING_ROOM', 'IN_SERVICE'] }
            }
        });

        if (activeVisits) {
            return res.status(400).json({ error: 'Não é possível excluir recurso com tickets ativos na fila.' });
        }

        await prisma.resource.delete({ where: { id } });
        res.json({ message: 'Resource deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete resource' });
    }
});

// --- PUBLIC QUEUE DISPLAY ENDPOINT (no auth required) ---

app.get('/api/queue/display', async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // Fetch today's active tickets (IN_SERVICE, IN_WAITING_ROOM, and NO_SHOW)
        const activeVisits = await prisma.visit.findMany({
            where: {
                ticketStatus: { in: ['IN_SERVICE', 'IN_WAITING_ROOM', 'NO_SHOW'] },
                sector: { isVisibleOnPanel: true }, // Filter to only sectors visible on panel
                timestamp: { gte: startOfToday }
            },
            orderBy: { timestamp: 'desc' },
            take: 20,
            include: { 
                sector: { select: { name: true, callCooldown: true } },
                citizen: { select: { name: true } },
                resource: { select: { name: true } }
            }
        });

        // Calculate average service time heuristic:
        // If we have finished visits, estimate based on total elapsed time vs finished count
        const finishedCount = await prisma.visit.count({
            where: {
                ticketStatus: 'FINISHED',
                timestamp: { gte: startOfToday }
            }
        });

        let avgWaitMinutes: number | null = null;
        if (finishedCount > 0) {
            // Approximate: total minutes elapsed since start of day / finished count
            const nowMs = Date.now();
            const startMs = startOfToday.getTime();
            const elapsedMinutes = (nowMs - startMs) / 60000;
            avgWaitMinutes = Math.max(1, Math.round(elapsedMinutes / finishedCount));
        }

        const tickets = activeVisits.map(v => ({
            id: v.id,
            code: v.code,
            sectorName: v.sector?.name ?? 'Geral',
            sectorCooldown: v.sector?.callCooldown ?? 120,
            citizenName: v.citizen?.name ?? 'Cidadão',
            resourceName: v.resource?.name,
            status: v.ticketStatus,
            isPriority: v.isPriority,
            timestamp: v.timestamp,
            calledAt: v.calledAt
        }));

        res.json({ tickets, avgWaitMinutes });
    } catch (error) {
        console.error('Error fetching queue display:', error);
        res.status(500).json({ error: 'Failed to fetch queue display data' });
    }
});


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
        const { cpf, name, phone, sectorId, isPriority, resourceId } = req.body;
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

        // Count ALL historical visits FOR THIS SECTOR specifically to make the code cumulative and unique
        const totalCount = await prisma.visit.count({
            where: {
                sectorId: sectorId
            }
        });

        // Extract up to 3 letters from sector name for the prefix
        const prefix = sector.name
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
            .replace(/[^a-zA-Z]/g, '') // remove non-letters
            .substring(0, 3)
            .toUpperCase() || 'GER'; // fallback to GER if no letters

        const ticketNum = totalCount + 1;
        const baseCode = `${prefix}-${String(ticketNum).padStart(3, '0')}`;
        const code = isPriority ? `P-${baseCode}` : baseCode;

        // Create visit
        const visit = await prisma.visit.create({
            data: {
                code,
                citizenId: citizen.cpf,
                sectorId,
                userId,
                resourceId: resourceId || null,
                isPriority: isPriority || false,
                ticketStatus: 'WAITING'
            },
            include: { citizen: true, sector: true, resource: true }
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

        if (filterType) {
            let startDate: Date;
            let endDate: Date;

            if (filterType === 'custom') {
                const customStart = req.query.startDate as string;
                const customEnd = req.query.endDate as string;
                if (customStart && customEnd) {
                    // Ensures the dates are parsed as local midnight (UTC-3 for user)
                    // We also ensure end date includes the whole day
                    startDate = new Date(customStart + 'T00:00:00-03:00');
                    endDate = new Date(customEnd + 'T23:59:59.999-03:00');
                } else {
                    // Fallback to today UTC-3
                    startDate = new Date();
                    startDate.setHours(0, 0, 0, 0); 
                    endDate = new Date();
                    endDate.setHours(23, 59, 59, 999);
                }
            } else {
                // For day, week, month, use 'date' or default to today
                const targetDate = date ? new Date(date as string) : new Date();
                startDate = new Date(targetDate);
                endDate = new Date(targetDate);

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

// --- CITIZENS ROUTES --- //
app.get('/api/citizens/:cpf', authenticateToken, async (req, res) => {
    try {
        const cpf = req.params.cpf;
        const citizen = await prisma.citizen.findUnique({
            where: { cpf }
        });
        if (!citizen) return res.status(404).json({ error: 'Cidadão não encontrado' });
        res.json(citizen);
    } catch (error) {
        console.error('Error fetching citizen:', error);
        res.status(500).json({ error: 'Erro ao buscar cidadão' });
    }
});

// --- ENTRY LOG (CADERNO DE ENTRADA) ROUTES --- //

app.post('/api/entry-logs', authenticateToken, async (req, res) => {
    try {
        const { cpf, name, phone, sectorId } = req.body;
        
        // As requested by the user, if the citizen doesn't exist, we create them
        // to populate the phone book for future use.
        const citizen = await prisma.citizen.upsert({
            where: { cpf },
            update: { name, phone },
            create: { cpf, name, phone }
        });

        const entryLog = await prisma.entryLog.create({
            data: {
                cpf: citizen.cpf,
                name: citizen.name,
                phone: citizen.phone,
                sectorId
            },
            include: { sector: true }
        });

        res.status(201).json(entryLog);
    } catch (error) {
        console.error('Error creating entry log:', error);
        res.status(500).json({ error: 'Failed to create entry log' });
    }
});

app.get('/api/entry-logs', authenticateToken, async (req, res) => {
    try {
        const { date, filterType, startDate, endDate, sectorId, cpf } = req.query;

        let queryOptions: any = {
            include: { sector: true },
            orderBy: { timestamp: 'desc' },
            where: {}
        };

        if (sectorId) {
            queryOptions.where.sectorId = sectorId as string;
        }

        if (cpf) {
            queryOptions.where.cpf = { contains: cpf as string };
        }

        if (filterType) {
            let sDate: Date;
            let eDate: Date;

            if (filterType === 'custom') {
                if (startDate && endDate) {
                    sDate = new Date((startDate as string) + 'T00:00:00-03:00');
                    eDate = new Date((endDate as string) + 'T23:59:59.999-03:00');
                } else {
                    sDate = new Date();
                    sDate.setHours(0, 0, 0, 0);
                    eDate = new Date();
                    eDate.setHours(23, 59, 59, 999);
                }
            } else {
                const targetDate = date ? new Date(date as string) : new Date();
                sDate = new Date(targetDate);
                eDate = new Date(targetDate);

                if (filterType === 'day') {
                    sDate.setHours(0, 0, 0, 0);
                    eDate.setHours(23, 59, 59, 999);
                } else if (filterType === 'week') {
                    const day = sDate.getDay();
                    sDate.setDate(sDate.getDate() - day);
                    sDate.setHours(0, 0, 0, 0);
                    eDate.setDate(eDate.getDate() + (6 - day));
                    eDate.setHours(23, 59, 59, 999);
                } else if (filterType === 'month') {
                    sDate.setDate(1);
                    sDate.setHours(0, 0, 0, 0);
                    eDate.setMonth(eDate.getMonth() + 1);
                    eDate.setDate(0);
                    eDate.setHours(23, 59, 59, 999);
                }
            }
            queryOptions.where.timestamp = { gte: sDate, lte: eDate };
        } else if (!cpf) {
            // Default to today if no specific filter
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayEnd = new Date();
            todayEnd.setHours(23, 59, 59, 999);
            queryOptions.where.timestamp = { gte: todayStart, lte: todayEnd };
        }

        const logs = await prisma.entryLog.findMany(queryOptions);
        res.json(logs);
    } catch (error) {
        console.error('Error fetching entry logs:', error);
        res.status(500).json({ error: 'Failed to fetch entry logs' });
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

app.patch('/api/visits/:code/no-show', authenticateToken, async (req, res) => {
    try {
        const code = req.params.code as string;

        const visit = await prisma.visit.findUnique({
            where: { code },
            include: { sector: true }
        });

        if (!visit) return res.status(404).json({ error: `Ticket [${code}] não encontrado no banco de dados.` });
        if (visit.ticketStatus === 'FINISHED') return res.status(400).json({ error: `Ticket [${code}] já foi finalizado anteriormente.` });
        if (visit.ticketStatus === 'EXPIRED') return res.status(400).json({ error: `Ticket [${code}] expirou por ser de um dia anterior.` });

        // Mark as NO_SHOW so the ticket stays visible on the display panel (orange)
        const updated = await prisma.visit.update({
            where: { id: visit.id },
            data: { 
                ticketStatus: 'NO_SHOW',
                finishedAt: new Date()
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error no-show:', error);
        res.status(500).json({ error: 'Failed to record no-show' });
    }
});

app.post('/api/sectors/:id/call-next', authenticateToken, async (req, res) => {
    try {
        const sectorId = req.params.id as string;
        const { resourceId } = req.body || {};

        // Get sector info to check if it has a waiting room
        const sector = await prisma.sector.findUnique({
            where: { id: sectorId }
        });

        if (!sector) {
           return res.status(404).json({ error: 'Sector not found' });
        }

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        let nextVisit = null;

        // 1. If Sector has Waiting Room, we must call from IN_WAITING_ROOM first
        if (sector.hasWaitingRoom) {
            // Priority First
            nextVisit = await prisma.visit.findFirst({
                where: {
                    sectorId,
                    resourceId: resourceId !== undefined ? resourceId : undefined,
                    ticketStatus: 'IN_WAITING_ROOM',
                    isPriority: true,
                    timestamp: { gte: startOfToday }
                },
                orderBy: { calledToWaitingRoomAt: 'asc' },
                include: { citizen: true, sector: true }
            });

            // If no priority, then Normal
            if (!nextVisit) {
                nextVisit = await prisma.visit.findFirst({
                    where: {
                        sectorId,
                        resourceId: resourceId !== undefined ? resourceId : undefined,
                        ticketStatus: 'IN_WAITING_ROOM',
                        timestamp: { gte: startOfToday }
                    },
                    orderBy: { calledToWaitingRoomAt: 'asc' },
                    include: { citizen: true, sector: true }
                });
            }
        }

        // 2. If no one in waiting room OR sector doesn't use waiting room, call from WAITING
        if (!nextVisit) {
            // Priority First
            nextVisit = await prisma.visit.findFirst({
                where: {
                    sectorId,
                    resourceId: resourceId !== undefined ? resourceId : undefined,
                    ticketStatus: 'WAITING',
                    isPriority: true,
                    timestamp: { gte: startOfToday }
                },
                orderBy: { timestamp: 'asc' },
                include: { citizen: true, sector: true }
            });

            // If no priority, then Normal
            if (!nextVisit) {
                nextVisit = await prisma.visit.findFirst({
                    where: {
                        sectorId,
                        resourceId: resourceId !== undefined ? resourceId : undefined,
                        ticketStatus: 'WAITING',
                        timestamp: { gte: startOfToday }
                    },
                    orderBy: { timestamp: 'asc' },
                    include: { citizen: true, sector: true }
                });
            }
        }

        if (!nextVisit) {
            return res.status(404).json({ error: 'Nenhum cidadão aguardando na fila.' });
        }

        // Update visit status to IN_SERVICE
        const updatedVisit = await prisma.visit.update({
            where: { id: nextVisit.id },
            data: { 
                ticketStatus: 'IN_SERVICE',
                calledAt: new Date()
            },
            include: { citizen: true, sector: true }
        });

        // Decrement sector queue count ONLY if the person is coming from the general WAITING queue
        if (nextVisit.ticketStatus === 'WAITING') {
            await prisma.sector.update({
                where: { id: sectorId },
                data: { queueCount: { decrement: 1 } }
            });
        }

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

        if (!visit) return res.status(404).json({ error: `Ticket [${code}] não encontrado no banco de dados.` });
        if (visit.ticketStatus === 'FINISHED') return res.status(400).json({ error: `Ticket [${code}] já foi finalizado anteriormente.` });
        if (visit.ticketStatus === 'EXPIRED') return res.status(400).json({ error: `Ticket [${code}] expirou por ser de um dia anterior.` });

        // Mark as finished
        const updated = await prisma.visit.update({
            where: { id: visit.id },
            data: { 
                ticketStatus: 'FINISHED',
                finishedAt: new Date()
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error checkout:', error);
        res.status(500).json({ error: 'Failed to checkout' });
    }
});

// --- BATCH CALLING ENDPOINTS ---

app.get('/api/sectors/:id/waiting', authenticateToken, async (req, res) => {
    try {
        const sectorId = req.params.id as string;
        const startOfToday = new Date();
        todayReset(startOfToday); // helper to set to start of day

        const waitingVisits = await prisma.visit.findMany({
            where: {
                sectorId,
                ticketStatus: { in: ['WAITING', 'IN_WAITING_ROOM'] },
                timestamp: { gte: startOfToday }
            },
            orderBy: { timestamp: 'asc' },
            include: { citizen: { select: { name: true, cpf: true } } }
        });

        res.json(waitingVisits);
    } catch (error) {
        console.error('Error fetching waiting visits:', error);
        res.status(500).json({ error: 'Failed to fetch waiting list' });
    }
});

// --- NOVO REGISTRO: MANDAR PARA A SALA DE ESPERA ---
app.post('/api/sectors/:id/call-to-waiting-room', authenticateToken, async (req, res) => {
    try {
        const sectorId = req.params.id as string;

        const sector = await prisma.sector.findUnique({ where: { id: sectorId } });
        if (!sector) return res.status(404).json({ error: 'Sector not found' });
        if (!sector.hasWaitingRoom) return res.status(400).json({ error: 'Setor não possui sala de espera configurada.' });

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        // 1. Check Capacity
        const currentInRoom = await prisma.visit.count({
            where: {
                sectorId,
                ticketStatus: 'IN_WAITING_ROOM',
                timestamp: { gte: startOfToday }
            }
        });

        if (currentInRoom >= sector.waitingRoomCapacity) {
            return res.status(400).json({ error: 'A sala de espera está cheia.' });
        }

        // 2. Check Cooldown
        const lastCalled = await prisma.visit.findFirst({
            where: {
                sectorId,
                ticketStatus: { in: ['IN_WAITING_ROOM', 'IN_SERVICE', 'FINISHED'] }, // Qualquer um que já passou da recepção geral
                calledToWaitingRoomAt: { not: null },
                timestamp: { gte: startOfToday }
            },
            orderBy: { calledToWaitingRoomAt: 'desc' }
        });

        if (lastCalled && lastCalled.calledToWaitingRoomAt) {
            const diffInSeconds = Math.floor((new Date().getTime() - lastCalled.calledToWaitingRoomAt.getTime()) / 1000);
            if (diffInSeconds < sector.callCooldown) {
                return res.status(429).json({ error: `Aguarde o intervalo de chamada. Faltam ${sector.callCooldown - diffInSeconds} segundos.` });
            }
        }

        // 3. Find next in QUEUE
        // Priority First
        let nextVisit = await prisma.visit.findFirst({
            where: {
                sectorId,
                ticketStatus: 'WAITING',
                isPriority: true,
                timestamp: { gte: startOfToday }
            },
            orderBy: { timestamp: 'asc' },
            include: { citizen: true, sector: true }
        });

        // If no priority, then Normal
        if (!nextVisit) {
            nextVisit = await prisma.visit.findFirst({
                where: {
                    sectorId,
                    ticketStatus: 'WAITING',
                    timestamp: { gte: startOfToday }
                },
                orderBy: { timestamp: 'asc' },
                include: { citizen: true, sector: true }
            });
        }

        if (!nextVisit) {
            return res.status(404).json({ error: 'Nenhum cidadão aguardando na fila da recepção.' });
        }

        // 4. Update to IN_WAITING_ROOM
        const updatedVisit = await prisma.visit.update({
            where: { id: nextVisit.id },
            data: { 
                ticketStatus: 'IN_WAITING_ROOM',
                calledToWaitingRoomAt: new Date()
            },
            include: { citizen: true, sector: true }
        });

        // 5. Decrement sector queue count since the person left the global WAITING queue
        await prisma.sector.update({
            where: { id: sectorId },
            data: { queueCount: { decrement: 1 } }
        });

        res.json(updatedVisit);
    } catch (error) {
        console.error('Error calling to waiting room:', error);
        res.status(500).json({ error: 'Failed to call to waiting room' });
    }
});

app.get('/api/sectors/:id/in-service', authenticateToken, async (req, res) => {
    try {
        const sectorId = req.params.id as string;
        const startOfToday = new Date();
        todayReset(startOfToday);

        const inServiceVisits = await prisma.visit.findMany({
            where: {
                sectorId,
                ticketStatus: 'IN_SERVICE',
                timestamp: { gte: startOfToday }
            },
            orderBy: { timestamp: 'asc' },
            include: { citizen: { select: { name: true, cpf: true } } }
        });

        res.json(inServiceVisits);
    } catch (error) {
        console.error('Error fetching in-service visits:', error);
        res.status(500).json({ error: 'Failed to fetch in-service list' });
    }
});



// --- SECTOR STATUS & QUEUE REST ENDPOINTS ---

// --- GENERAL SECTOR UPDATE (Admin only) ---
app.patch('/api/sectors/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const id = req.params.id as string;
        const { name, callCooldown, soundUrl, hasWaitingRoom, waitingRoomCapacity, isHeterogeneous, isVisibleOnPanel } = req.body;

        const updatedSector = await prisma.sector.update({
            where: { id },
            data: { 
                name, 
                callCooldown: callCooldown !== undefined ? parseInt(callCooldown) : undefined,
                soundUrl,
                hasWaitingRoom: hasWaitingRoom !== undefined ? Boolean(hasWaitingRoom) : undefined,
                waitingRoomCapacity: waitingRoomCapacity !== undefined ? parseInt(waitingRoomCapacity) : undefined,
                isHeterogeneous: isHeterogeneous !== undefined ? Boolean(isHeterogeneous) : undefined,
                isVisibleOnPanel: isVisibleOnPanel !== undefined ? Boolean(isVisibleOnPanel) : undefined
            },
        });

        res.json(updatedSector);
    } catch (error) {
        console.error('Error updating sector:', error);
        res.status(500).json({ error: 'Failed to update sector' });
    }
});

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

app.get('/api/sync-queues-manual', async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const sectors = await prisma.sector.findMany();
        let synced = [];

        for (const sector of sectors) {
            const actualCount = await prisma.visit.count({
                where: {
                    sectorId: sector.id,
                    ticketStatus: 'WAITING',
                    timestamp: { gte: startOfToday }
                }
            });

            if (sector.queueCount !== actualCount) {
                await prisma.sector.update({
                    where: { id: sector.id },
                    data: { queueCount: actualCount }
                });
                synced.push({ sector: sector.name, old: sector.queueCount, new: actualCount });
            }
        }
        res.json({ message: "Done", synced });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to sync API' });
    }
});

app.use('/api/export', authenticateToken, exportRoutes);
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

