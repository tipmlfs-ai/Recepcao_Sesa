"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function sync() {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
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
        console.log(`Sector ${sector.name} [${sector.id}]:`);
        console.log(`  Old queueCount: ${sector.queueCount}`);
        console.log(`  New synced count: ${actualQueueCount}`);
    }
}
sync()
    .then(() => {
    console.log("Done syncing queues.");
    process.exit(0);
})
    .catch((error) => {
    console.error(error);
    process.exit(1);
});
