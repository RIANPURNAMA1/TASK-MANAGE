import { createNotifications, prisma, toNotificationDTO, type NotificationType, type Prisma } from '@nexus/db';
import type { JobContext } from './context';

const BATCH = 200;

type Marker = 'dueReminderSentAt' | 'overdueNotifiedAt';

/**
 * FR-24: notifies assignees once when a card is due within 24 hours (H-1) and once when it
 * becomes overdue. The marker columns make the job idempotent; they reset when the due
 * date changes.
 */
export async function runDueReminders(ctx: JobContext): Promise<void> {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600 * 1000);
  const open: Prisma.CardWhereInput = {
    completedAt: null,
    archivedAt: null,
    list: { archivedAt: null },
    project: { archivedAt: null },
    assignees: { some: {} },
  };

  const dueSoon = await remind(
    { ...open, dueDate: { gt: now, lte: in24h }, dueReminderSentAt: null },
    'DUE_SOON',
    'dueReminderSentAt',
    ctx,
  );
  const overdue = await remind(
    { ...open, dueDate: { lte: now }, overdueNotifiedAt: null },
    'OVERDUE',
    'overdueNotifiedAt',
    ctx,
  );
  if (dueSoon || overdue) ctx.logger.info({ dueSoon, overdue }, 'due reminders sent');
}

async function remind(
  where: Prisma.CardWhereInput,
  type: NotificationType,
  marker: Marker,
  ctx: JobContext,
): Promise<number> {
  let total = 0;
  for (;;) {
    const cards = await prisma.card.findMany({
      where,
      take: BATCH,
      select: {
        id: true,
        title: true,
        projectId: true,
        project: { select: { name: true } },
        assignees: { select: { userId: true } },
      },
    });
    if (cards.length === 0) return total;

    const rows = await prisma.$transaction(async (tx) => {
      await tx.card.updateMany({ where: { id: { in: cards.map((c) => c.id) } }, data: { [marker]: new Date() } });
      return createNotifications(
        tx,
        cards.flatMap((card) =>
          card.assignees.map((a) => ({
            userId: a.userId,
            type,
            projectId: card.projectId,
            cardId: card.id,
            data: { cardTitle: card.title, projectName: card.project.name },
          })),
        ),
      );
    });

    const instant = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.userId) }, emailDigest: 'INSTANT' },
      select: { id: true },
    });
    const instantIds = new Set(instant.map((u) => u.id));

    for (const row of rows) {
      ctx.emitToUser(row.userId, 'notification:new', { notification: toNotificationDTO(row) });
      if (instantIds.has(row.userId)) await ctx.enqueueEmail({ kind: 'notification', notificationId: row.id });
    }
    total += cards.length;
  }
}
