require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Connecting to:", process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
        const activeSectors = await prisma.sector.count();
        console.log(`Connection Successful! Found ${activeSectors} sectors.`);
    } catch (err) {
        console.error("Connection Failed:", err.message);
    } finally {
        await prisma.$disconnect();
    }
}

main();
