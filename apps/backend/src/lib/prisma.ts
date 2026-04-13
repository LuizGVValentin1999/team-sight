import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';

if (!process.env.DATABASE_URL) {
  const sqliteFilePath = fileURLToPath(
    new URL('../../../../packages/database/prisma/dev.db', import.meta.url)
  );
  process.env.DATABASE_URL = `file:${sqliteFilePath}`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
