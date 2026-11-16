import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';
export * from './dto';
export * from './notifications';

/** Transaction-scoped client, as passed to `prisma.$transaction(async (tx) => …)`. */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Single PrismaClient per process. Re-used across hot reloads in development
 * so we don't exhaust database connections.
 */
export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
