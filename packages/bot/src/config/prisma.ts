import { PrismaClient } from '@prisma/client';

import { env } from '@/src/env.js';

let prisma: PrismaClient | undefined = undefined;

export const getPrisma = () => {
  if (prisma) return prisma;
  prisma = new PrismaClient({
    datasourceUrl: `${env.DATABASE_URL}&pool_timeout=5000`,
    log: [
      {
        emit: 'event',
        level: 'query',
      },
    ],
  });
  return prisma;
};

process.on('beforeExit', async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
});
