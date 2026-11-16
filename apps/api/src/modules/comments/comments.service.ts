import { prisma, toUserSummary, userSummarySelect, type NotificationDraft, type Prisma, type Tx } from '@nexus/db';
import type { CommentDTO, CreateCommentInput, UpdateCommentInput } from '@nexus/shared';
import { badRequest, forbidden } from '../../lib/errors';
import { stripHtml } from '../../lib/sanitize';
import { transactional, type AfterCommit } from '../../lib/transaction';
import type { Actor } from '../access/actor';
import { requireCard, requireComment } from '../access/access.service';
import { recordActivity } from '../activity/activity.service';
import { attachmentInclude, toAttachmentDTO } from '../attachments/attachment.mapper';
import { publishCard } from '../board/cards.service';
import { notify } from '../notifications/notifications.service';

type Origin = string | undefined;

const commentInclude = {
  author: { select: userSummarySelect },
  mentions: { include: { user: { select: userSummarySelect } } },
  attachments: { where: { deletedAt: null, status: 'READY' }, include: attachmentInclude },
} satisfies Prisma.CommentInclude;

type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

function toDTO(row: CommentRow): CommentDTO {
  return {
    id: row.id,
    cardId: row.cardId,
    author: toUserSummary(row.author),
    body: row.body,
    mentions: row.mentions.map((m) => toUserSummary(m.user)),
    attachments: row.attachments.map(toAttachmentDTO),
    editedAt: row.editedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const excerpt = (body: string) => (body.length > 140 ? `${body.slice(0, 137)}…` : body);

/** Only project members can be mentioned — mentioning someone must not grant visibility. */
async function validMentionIds(tx: Tx, projectId: string, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const members = await tx.projectMember.findMany({
    where: { projectId, userId: { in: [...new Set(ids)] }, user: { deactivatedAt: null } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

export async function listComments(actor: Actor, cardId: string): Promise<CommentDTO[]> {
  await requireCard(actor, cardId, 'canView');
  const rows = await prisma.comment.findMany({
    where: { cardId, deletedAt: null },
    include: commentInclude,
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(toDTO);
}

/**
 * Mentioned users get MENTIONED; the card's assignees and creator get COMMENT_ADDED
 * (unless already mentioned). The actor is never notified (FR-21).
 */
async function notifyForComment(
  tx: Tx,
  afterCommit: AfterCommit,
  actor: Actor,
  card: { id: string; projectId: string; title: string },
  body: string,
  mentionIds: string[],
  includeWatchers: boolean,
) {
  const project = await tx.project.findUniqueOrThrow({ where: { id: card.projectId }, select: { name: true } });
  const base = { actorId: actor.userId, projectId: card.projectId, cardId: card.id };
  const data = { cardTitle: card.title, projectName: project.name, excerpt: excerpt(body) };

  const drafts: NotificationDraft[] = mentionIds.map((userId) => ({ ...base, userId, type: 'MENTIONED', data }));

  if (includeWatchers) {
    const watchers = await tx.card.findUniqueOrThrow({
      where: { id: card.id },
      select: { createdById: true, assignees: { select: { userId: true } } },
    });
    const watcherIds = new Set([watchers.createdById, ...watchers.assignees.map((a) => a.userId)]);
    for (const userId of watcherIds) {
      if (!mentionIds.includes(userId)) drafts.push({ ...base, userId, type: 'COMMENT_ADDED', data });
    }
  }
  await notify(tx, afterCommit, drafts);
}

export async function createComment(actor: Actor, cardId: string, input: CreateCommentInput, origin: Origin): Promise<CommentDTO> {
  const { entity: card } = await requireCard(actor, cardId, 'canEdit');
  const body = stripHtml(input.body).trim();
  if (!body) throw badRequest('Komentar kosong');

  return transactional(async (tx, afterCommit) => {
    const mentionIds = await validMentionIds(tx, card.projectId, input.mentionIds ?? []);
    const comment = await tx.comment.create({
      data: {
        cardId,
        authorId: actor.userId,
        body,
        mentions: { create: mentionIds.map((userId) => ({ userId })) },
      },
    });

    const attachmentIds = [...new Set(input.attachmentIds ?? [])];
    if (attachmentIds.length > 0) {
      // Only the uploader's own finished files from this project can be attached.
      const { count } = await tx.attachment.updateMany({
        where: {
          id: { in: attachmentIds },
          uploaderId: actor.userId,
          projectId: card.projectId,
          status: 'READY',
          deletedAt: null,
          commentId: null,
          messageId: null,
          OR: [{ cardId: null }, { cardId }],
        },
        data: { commentId: comment.id, cardId },
      });
      if (count !== attachmentIds.length) throw badRequest('Lampiran tidak valid');
    }

    await recordActivity(tx, {
      projectId: card.projectId, cardId, actorId: actor.userId, entityType: 'comment', entityId: comment.id,
      action: 'comment.created', diff: { excerpt: excerpt(body) },
    });
    await notifyForComment(tx, afterCommit, actor, { ...card, id: cardId }, body, mentionIds, true);
    await publishCard(tx, afterCommit, cardId, origin);

    return toDTO(await tx.comment.findUniqueOrThrow({ where: { id: comment.id }, include: commentInclude }));
  });
}

/** Authors edit their own comments; only newly added mentions are notified. */
export async function updateComment(actor: Actor, commentId: string, input: UpdateCommentInput, origin: Origin): Promise<CommentDTO> {
  const { entity } = await requireComment(actor, commentId, 'canEdit');
  if (entity.authorId !== actor.userId) throw forbidden('Hanya penulis yang bisa mengubah komentar');
  const body = stripHtml(input.body).trim();
  if (!body) throw badRequest('Komentar kosong');

  return transactional(async (tx, afterCommit) => {
    const mentionIds = await validMentionIds(tx, entity.projectId, input.mentionIds ?? []);
    const previous = await tx.mention.findMany({ where: { commentId }, select: { userId: true } });
    const previousIds = new Set(previous.map((m) => m.userId));

    await tx.mention.deleteMany({ where: { commentId } });
    await tx.comment.update({
      where: { id: commentId },
      data: { body, editedAt: new Date(), mentions: { create: mentionIds.map((userId) => ({ userId })) } },
    });

    const card = { id: entity.cardId, projectId: entity.projectId, title: entity.card.title };
    const newMentions = mentionIds.filter((id) => !previousIds.has(id));
    await notifyForComment(tx, afterCommit, actor, card, body, newMentions, false);
    await publishCard(tx, afterCommit, entity.cardId, origin);

    return toDTO(await tx.comment.findUniqueOrThrow({ where: { id: commentId }, include: commentInclude }));
  });
}

export async function deleteComment(actor: Actor, commentId: string, origin: Origin): Promise<void> {
  const { entity, access } = await requireComment(actor, commentId, 'canEdit');
  if (entity.authorId !== actor.userId && !access.canManage) throw forbidden();

  await transactional(async (tx, afterCommit) => {
    await tx.comment.update({ where: { id: commentId }, data: { deletedAt: new Date() } });
    await tx.attachment.updateMany({ where: { commentId }, data: { deletedAt: new Date() } });
    await recordActivity(tx, {
      projectId: entity.projectId, cardId: entity.cardId, actorId: actor.userId, entityType: 'comment',
      entityId: commentId, action: 'comment.deleted',
    });
    await publishCard(tx, afterCommit, entity.cardId, origin);
  });
}
