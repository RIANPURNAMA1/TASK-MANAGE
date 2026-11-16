import {
  createNotifications,
  notificationInclude,
  prisma,
  toNotificationDTO,
  type NotificationDraft,
  type Tx,
} from '@nexus/db';
import type { NotificationPage } from '@nexus/shared';
import { notFound } from '../../lib/errors';
import { enqueueEmail } from '../../lib/queue';
import type { AfterCommit } from '../../lib/transaction';
import { realtime } from '../../realtime/emitter';
import type { Actor } from '../access/actor';

/**
 * Persists notifications inside the caller's transaction and, after commit, pushes them
 * in real time (FR-21) and queues an email for users on instant delivery (FR-22).
 */
export async function notify(tx: Tx, afterCommit: AfterCommit, drafts: NotificationDraft[]): Promise<void> {
  const rows = await createNotifications(tx, drafts);
  if (rows.length === 0) return;

  const instant = await tx.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) }, emailDigest: 'INSTANT' },
    select: { id: true },
  });
  const instantIds = new Set(instant.map((u) => u.id));

  afterCommit(async () => {
    for (const row of rows) {
      realtime.toUser(row.userId, 'notification:new', { notification: toNotificationDTO(row) });
      if (instantIds.has(row.userId)) await enqueueEmail({ kind: 'notification', notificationId: row.id });
    }
  });
}

export async function listNotifications(
  actor: Actor,
  query: { cursor?: string; limit: number; unreadOnly: boolean },
): Promise<NotificationPage> {
  const where = { userId: actor.userId, ...(query.unreadOnly && { readAt: null }) };
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      include: notificationInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
    }),
    prisma.notification.count({ where: { userId: actor.userId, readAt: null } }),
  ]);
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit).map(toNotificationDTO);
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null, unreadCount };
}

export async function markRead(actor: Actor, id: string): Promise<void> {
  // Scoped by userId so nobody can mark another user's notification (IDOR).
  const { count } = await prisma.notification.updateMany({
    where: { id, userId: actor.userId },
    data: { readAt: new Date() },
  });
  if (count === 0) throw notFound('Notifikasi');
}

export async function markAllRead(actor: Actor): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId: actor.userId, readAt: null },
    data: { readAt: new Date() },
  });
}
