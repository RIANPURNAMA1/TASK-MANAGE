import type { NotificationType } from '@prisma/client';
import { notificationInclude, type NotificationRow } from './dto';
import type { Tx } from './index';

export interface NotificationDraft {
  userId: string;
  type: NotificationType;
  actorId?: string | null;
  /** Null for notifications not tied to a project (company/division announcements). */
  projectId: string | null;
  cardId?: string | null;
  data: {
    cardTitle?: string;
    projectName?: string;
    excerpt?: string;
    channelId?: string;
    channelName?: string;
    announcementId?: string;
    announcementTitle?: string;
    announcementKind?: 'posted' | 'comment';
    scopeLabel?: string;
  };
}

/** Direct actions on a person still notify even when they muted the project. */
const BYPASS_MUTE: ReadonlySet<NotificationType> = new Set(['CARD_ASSIGNED', 'MENTIONED', 'CHAT_MENTION']);

/**
 * Persists notifications after applying recipient rules:
 * never notify the actor, deactivated users, or users who muted the project
 * (except for direct actions), and at most one notification per user per call.
 */
export async function createNotifications(
  tx: Tx,
  drafts: readonly NotificationDraft[],
): Promise<NotificationRow[]> {
  const unique = new Map<string, NotificationDraft>();
  for (const draft of drafts) {
    if (draft.userId === draft.actorId) continue;
    if (!unique.has(draft.userId)) unique.set(draft.userId, draft);
  }
  if (unique.size === 0) return [];

  const userIds = [...unique.keys()];
  const projectIds = [...new Set([...unique.values()].map((d) => d.projectId).filter((id): id is string => id !== null))];

  const [inactive, mutes] = await Promise.all([
    tx.user.findMany({
      where: { id: { in: userIds }, deactivatedAt: { not: null } },
      select: { id: true },
    }),
    tx.projectMute.findMany({
      where: { userId: { in: userIds }, projectId: { in: projectIds } },
      select: { userId: true, projectId: true },
    }),
  ]);

  const inactiveIds = new Set(inactive.map((u) => u.id));
  const muted = new Set(mutes.map((m) => `${m.userId}:${m.projectId}`));

  const data = [...unique.values()]
    .filter((d) => !inactiveIds.has(d.userId))
    .filter((d) => BYPASS_MUTE.has(d.type) || d.projectId === null || !muted.has(`${d.userId}:${d.projectId}`))
    .map((d) => ({
      userId: d.userId,
      type: d.type,
      actorId: d.actorId ?? null,
      projectId: d.projectId,
      cardId: d.cardId ?? null,
      data: d.data,
    }));

  // MySQL has no INSERT … RETURNING, so rows are created one by one (recipient lists are small).
  const rows: NotificationRow[] = [];
  for (const row of data) {
    rows.push(await tx.notification.create({ data: row, include: notificationInclude }));
  }
  return rows;
}
