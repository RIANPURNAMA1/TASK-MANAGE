import { Prisma } from '@nexus/db';

/** True when a write failed on a unique constraint (Prisma P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
