require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const visits = await prisma.visit.findMany({
            where: {
                ticketStatus: 'WAITING',
                timestamp: { gte: startOfToday }
            },
            orderBy: [
                { isPriority: 'desc' },
                { timestamp: 'asc' }
            ],
            include: { citizen: true },
            take: 5
        });

        console.log("WAITING VISITS:");
        for (const v of visits) {
            console.log(`Citizen: ${v.citizen.name} | isPriority: ${v.isPriority} | resId: ${v.resourceId} | timestamp: ${v.timestamp}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
run();
