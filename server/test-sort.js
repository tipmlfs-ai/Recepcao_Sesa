const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const visits = await prisma.visit.findMany({
            where: {
                ticketStatus: 'IN_WAITING_ROOM',
                timestamp: { gte: startOfToday }
            },
            orderBy: [
                { isPriority: 'desc' },
                { calledToWaitingRoomAt: 'asc' }
            ],
            include: { citizen: true, sector: true }
        });

        console.log("Visits IN_WAITING_ROOM:");
        for (const v of visits) {
            console.log(`- ${v.citizen.name} | isPriority: ${v.isPriority} | calledToWaitingRoomAt: ${v.calledToWaitingRoomAt} | resourceId: ${v.resourceId} | sector: ${v.sector.name}`);
        }

        const visitsWAITING = await prisma.visit.findMany({
            where: {
                ticketStatus: 'WAITING',
                timestamp: { gte: startOfToday }
            },
            orderBy: [
                { isPriority: 'desc' },
                { timestamp: 'asc' }
            ],
            include: { citizen: true, sector: true }
        });

        console.log("\nVisits WAITING:");
        for (const v of visitsWAITING) {
            console.log(`- ${v.citizen.name} | isPriority: ${v.isPriority} | timestamp: ${v.timestamp} | resourceId: ${v.resourceId} | sector: ${v.sector.name}`);
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
        process.exit(0);
    }
}
run();
