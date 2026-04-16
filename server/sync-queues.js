const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function sync() {
    console.log("Starting sync...");
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const sectors = await prisma.sector.findMany();

    for (const sector of (sectors || [])) {
        const actualQueueCount = await prisma.visit.count({
            where: {
                sectorId: sector.id,
                ticketStatus: 'WAITING',
                timestamp: { gte: startOfToday }
            }
        });

        if (sector.queueCount !== actualQueueCount) {
             console.log(`Updating Sector ${sector.name} [${sector.id}] count: ${sector.queueCount} -> ${actualQueueCount}`);
             await prisma.sector.update({
                 where: { id: sector.id },
                 data: { queueCount: actualQueueCount }
             });
        } else {
             console.log(`Sector ${sector.name} [${sector.id}] is correct at ${actualQueueCount}.`);
        }
    }
}

sync()
    .then(async () => {
        console.log("Done syncing queues.");
        await prisma.$disconnect();
        process.exit(0);
    })
    .catch(async (error) => {
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    });
