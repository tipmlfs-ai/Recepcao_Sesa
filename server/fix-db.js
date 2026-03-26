const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fix() {
  try {
    console.log("Adding column...");
    await prisma.$executeRawUnsafe('ALTER TABLE "Visit" ADD COLUMN "calledAt" TIMESTAMP(3);');
    console.log("Column added successfully!");
  } catch (e) {
    if (e.message.includes('already exists')) {
       console.log("Column already exists.");
    } else {
       console.error("Error:", e);
    }
  }
}

fix().finally(() => prisma.$disconnect());
