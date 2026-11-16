import { prisma } from '@nexus/db';
import type { JobContext } from './context';

const DAY = 24 * 3600 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

/**
 * Retention (NFR-07): activity log 1 year, audit log 2 years, plus housekeeping of
 * expired tokens/sessions and uploads that were never completed.
 */
export async function runCleanup(ctx: JobContext): Promise<void> {
  const [tokens, sessions, pendingUploads, activities, audits] = await prisma.$transaction([
    prisma.userToken.deleteMany({ where: { OR: [{ expiresAt: { lt: ago(7) } }, { usedAt: { lt: ago(7) } }] } }),
    prisma.session.deleteMany({ where: { OR: [{ revokedAt: { lt: ago(30) } }, { expiresAt: { lt: ago(30) } }] } }),
    prisma.attachment.deleteMany({ where: { status: 'PENDING', createdAt: { lt: ago(1) } } }),
    prisma.activityLog.deleteMany({ where: { createdAt: { lt: ago(365) } } }),
    prisma.auditLog.deleteMany({ where: { createdAt: { lt: ago(730) } } }),
  ]);
  ctx.logger.info(
    {
      tokens: tokens.count,
      sessions: sessions.count,
      pendingUploads: pendingUploads.count,
      activities: activities.count,
      audits: audits.count,
    },
    'cleanup finished',
  );
}
