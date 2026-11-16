import type { NotificationDTO, UserSummary } from '@nexus/shared';
import type { Prisma } from '@prisma/client';

/**
 * Entity → DTO mappers shared by every backend process (API and worker).
 * The `*Select` / `*Include` objects pair with their mapper so a query always
 * fetches exactly what the DTO needs.
 */

export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export type UserSummaryRow = Prisma.UserGetPayload<{ select: typeof userSummarySelect }>;

export function toUserSummary(user: UserSummaryRow): UserSummary {
  return { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl };
}

export const notificationInclude = {
  actor: { select: userSummarySelect },
} satisfies Prisma.NotificationInclude;

export type NotificationRow = Prisma.NotificationGetPayload<{ include: typeof notificationInclude }>;

export function toNotificationDTO(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    actor: row.actor ? toUserSummary(row.actor) : null,
    projectId: row.projectId,
    cardId: row.cardId,
    data: (row.data ?? {}) as NotificationDTO['data'],
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
