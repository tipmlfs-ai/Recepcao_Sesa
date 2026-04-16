import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function applyMigrations() {
  try {
    console.log('Iniciando migração manual via SQL...');

    // 1. Adicionar coluna isHeterogeneous em Sector
    await prisma.$executeRawUnsafe(`ALTER TABLE "Sector" ADD COLUMN IF NOT EXISTS "isHeterogeneous" BOOLEAN NOT NULL DEFAULT false;`);
    console.log('✔ Coluna "isHeterogeneous" adicionada ao Setor.');

    // 2. Criar tabela Resource
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Resource" (
          "id" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "sectorId" TEXT NOT NULL,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
      );
    `);
    console.log('✔ Tabela "Resource" garantida.');

    // 3. Criar índice único se não existir
    try {
        await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "Resource_name_sectorId_key" ON "Resource"("name", "sectorId");`);
        console.log('✔ Índice único em Resource garantido.');
    } catch(e: any) {}

    // 4. Criar FK para Sector
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Resource" ADD CONSTRAINT "Resource_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;`);
        console.log('✔ Foreign Key Resource -> Sector adicionada.');
    } catch(e: any) {}

    // 5. Adicionar recursoId em Visit
    await prisma.$executeRawUnsafe(`ALTER TABLE "Visit" ADD COLUMN IF NOT EXISTS "resourceId" TEXT;`);
    console.log('✔ Coluna "resourceId" adicionada em Visit.');

    // 6. Criar FK para Resource
    try {
        await prisma.$executeRawUnsafe(`ALTER TABLE "Visit" ADD CONSTRAINT "Visit_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE SET NULL ON UPDATE CASCADE;`);
        console.log('✔ Foreign Key Visit -> Resource adicionada.');
    } catch(e: any) {}

    console.log('🚀 Migração manual concluída com sucesso!');

  } catch (error: any) {
    console.error('❌ Erro ao aplicar migração manual:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

applyMigrations();
