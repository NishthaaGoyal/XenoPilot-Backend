import { PrismaClient } from '@prisma/client';

// Singleton Prisma instance
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});
