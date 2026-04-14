import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';

function normalizeDatabaseUrl(databaseUrl: string) {
  if (!databaseUrl.startsWith('file:')) {
    return databaseUrl;
  }

  const rawPathAndQuery = databaseUrl.slice('file:'.length);

  if (!rawPathAndQuery || rawPathAndQuery.startsWith('/')) {
    return databaseUrl;
  }

  const [rawPath, rawQuery] = rawPathAndQuery.split('?');
  const backendRootUrl = new URL('../../', import.meta.url);
  const absolutePath = fileURLToPath(new URL(rawPath, backendRootUrl));
  const querySuffix = rawQuery ? `?${rawQuery}` : '';

  return `file:${absolutePath}${querySuffix}`;
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
} else {
  const fallbackSqlitePath = fileURLToPath(
    new URL('../../../../packages/database/prisma/dev.db', import.meta.url)
  );
  process.env.DATABASE_URL = `file:${fallbackSqlitePath}`;
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
