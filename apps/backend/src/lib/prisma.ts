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

export async function ensureDatabaseSchema() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "TeamVacation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "startDate" DATETIME NOT NULL,
      "endDate" DATETIME NOT NULL,
      "description" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "TeamVacation_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User" ("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "TeamVacation_userId_idx" ON "TeamVacation"("userId");'
  );
  await prisma.$executeRawUnsafe(
    'CREATE INDEX IF NOT EXISTS "TeamVacation_startDate_endDate_idx" ON "TeamVacation"("startDate", "endDate");'
  );
}
