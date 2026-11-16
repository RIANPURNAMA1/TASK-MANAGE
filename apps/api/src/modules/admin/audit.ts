import { prisma, type Prisma } from '@nexus/db';
import type { Actor } from '../access/actor';

/** Organization-level security log for admin actions (PRD §8, FR-30 groundwork). */
export async function writeAudit(
  actor: Actor,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Prisma.InputJsonObject,
  ipAddress: string | null,
): Promise<void> {
  await prisma.auditLog.create({
    data: { orgId: actor.orgId, actorId: actor.userId, action, targetType, targetId, metadata, ipAddress },
  });
}
