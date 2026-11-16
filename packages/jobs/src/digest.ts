import { prisma } from '@nexus/db';
import { notificationUrl, type JobContext } from './context';
import { dailyDigest } from './emails/templates';

const MAX_LINES = 30;

/** FR-22 "harian" mode: one email per user with their unread, not-yet-emailed notifications. */
export async function runDailyDigest(ctx: JobContext): Promise<void> {
  const users = await prisma.user.findMany({
    where: { emailDigest: 'DAILY', deactivatedAt: null },
    select: { id: true, name: true, email: true },
  });

  let sent = 0;
  for (const user of users) {
    const since = new Date(Date.now() - 24 * 3600 * 1000);
    const notifications = await prisma.notification.findMany({
      where: { userId: user.id, readAt: null, emailedAt: null, createdAt: { gte: since } },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: MAX_LINES,
    });
    if (notifications.length === 0) continue;

    const lines = notifications.map((n) => {
      const data = n.data as { cardTitle?: string; projectName?: string; excerpt?: string; channelId?: string; channelName?: string; announcementId?: string; announcementTitle?: string; announcementKind?: 'posted' | 'comment'; scopeLabel?: string };
      return {
        type: n.type,
        actorName: n.actor?.name ?? null,
        cardTitle: data.cardTitle ?? data.channelName ?? data.announcementTitle ?? 'Kartu',
        projectName: data.projectName ?? data.scopeLabel ?? '',
        announcementKind: data.announcementKind,
        url: notificationUrl(ctx.webUrl, { projectId: n.projectId, cardId: n.cardId, data }),
      };
    });

    try {
      const email = dailyDigest(user.name, lines, ctx.webUrl);
      await ctx.sendMail({ to: user.email, ...email });
      await prisma.$transaction([
        prisma.notification.updateMany({
          where: { id: { in: notifications.map((n) => n.id) } },
          data: { emailedAt: new Date() },
        }),
        prisma.user.update({ where: { id: user.id }, data: { lastDigestAt: new Date() } }),
      ]);
      sent++;
    } catch (err) {
      // One bad mailbox must not stop the rest of the digest run.
      ctx.logger.error({ err, userId: user.id }, 'digest email failed');
    }
  }
  ctx.logger.info({ sent }, 'daily digest finished');
}
