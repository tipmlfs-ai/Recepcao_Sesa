import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  try {
    console.log('Testando conexão...');
    const sectors = await prisma.sector.findMany({
        take: 1
    });
    console.log('Conexão OK. Setores encontrados:', sectors.length);
    
    // Check for resources
    try {
        const resources = await (prisma as any).resource.findMany({ take: 1 });
        console.log('Tabela Resource existe.');
    } catch (e: any) {
        console.log('Tabela Resource NÃO encontrada ou erro:', e.message);
    }

  } catch (error: any) {
    console.error('Erro na conexão ou consulta:', error.message);
    if (error.code) console.error('Código do erro:', error.code);
  } finally {
    await prisma.$disconnect();
  }
}

test();
