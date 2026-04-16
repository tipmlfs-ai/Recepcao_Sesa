import { PrismaClient } from '@prisma/client';

const dbUrl = process.env.DATABASE_URL + '&pool_timeout=60';
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbUrl
    }
  }
});

async function main() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Sector" ADD COLUMN "isVisibleOnPanel" BOOLEAN NOT NULL DEFAULT true;`);
    console.log('Column isVisibleOnPanel added.');
  } catch (e) {
    if (e.message?.includes('already exists') || String(e).includes('already exists') || e.code === '42701') {
       console.log('Column isVisibleOnPanel already exists.');
    } else {
       console.error('Error adding isVisibleOnPanel:', e);
    }
  }

  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Sector" ADD COLUMN "isHeterogeneous" BOOLEAN NOT NULL DEFAULT false;`);
    console.log('Column isHeterogeneous added.');
  } catch (e) {
    if (e.message?.includes('already exists') || String(e).includes('already exists') || e.code === '42701') {
       console.log('Column isHeterogeneous already exists.');
    } else {
       console.error('Error adding isHeterogeneous:', e);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
