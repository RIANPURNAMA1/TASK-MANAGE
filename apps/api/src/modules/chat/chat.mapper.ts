import { toUserSummary, userSummarySelect, type Prisma } from '@nexus/db';
import type { MessageDTO, ReactionDTO } from '@nexus/shared';
import { attachmentInclude, toAttachmentDTO } from '../attachments/attachment.mapper';

export const messageInclude = {
  author: { select: userSummarySelect },
  replyTo: {
    select: { id: true, body: true, deletedAt: true, author: { select: { name: true } } },
  },
  mentions: { include: { user: { select: userSummarySelect } } },
  reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } },
  attachments: { where: { deletedAt: null, status: 'READY' }, include: attachmentInclude },
} satisfies Prisma.MessageInclude;

export type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export const excerpt = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Groups reactions by emoji, keeping the order in which each emoji was first used. */
function groupReactions(rows: { emoji: string; userId: string }[]): ReactionDTO[] {
  const groups = new Map<string, string[]>();
  for (const { emoji, userId } of rows) groups.set(emoji, [...(groups.get(emoji) ?? []), userId]);
  return [...groups].map(([emoji, userIds]) => ({ emoji, count: userIds.length, userIds }));
}

/** Deleted messages keep their place in the timeline but expose no content. */
export function toMessageDTO(row: MessageRow): MessageDTO {
  const deleted = row.deletedAt !== null;
  return {
    id: row.id,
    channelId: row.channelId,
    clientMessageId: row.clientMessageId,
    author: toUserSummary(row.author),
    body: deleted ? '' : row.body,
    replyTo: row.replyTo && {
      id: row.replyTo.id,
      authorName: row.replyTo.author.name,
      body: row.replyTo.deletedAt ? '' : excerpt(row.replyTo.body, 120),
      deleted: row.replyTo.deletedAt !== null,
    },
    mentions: deleted ? [] : row.mentions.map((m) => toUserSummary(m.user)),
    reactions: deleted ? [] : groupReactions(row.reactions),
    attachments: deleted ? [] : row.attachments.map(toAttachmentDTO),
    editedAt: row.editedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
