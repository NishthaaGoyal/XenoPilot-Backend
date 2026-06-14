import { PrismaClient } from '@prisma/client';

let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.includes('pooler.supabase.com') && !databaseUrl.includes('pgbouncer=true')) {
  databaseUrl += databaseUrl.includes('?') ? '&pgbouncer=true' : '?pgbouncer=true';
}

// Singleton Prisma instance
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  datasources: {
    db: {
      url: databaseUrl
    }
  }
});
