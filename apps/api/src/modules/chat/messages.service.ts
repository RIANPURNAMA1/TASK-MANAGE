import { prisma, type Channel, type NotificationDraft, type Tx } from '@nexus/db';
import type { EditMessageInput, MessageDTO, MessagePage, SendMessageInput } from '@nexus/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/prisma-errors';
import { stripHtml } from '../../lib/sanitize';
import { transactional, type AfterCommit } from '../../lib/transaction';
import { realtime } from '../../realtime/emitter';
import type { Actor } from '../access/actor';
import { notify } from '../notifications/notifications.service';
import { channelParticipantIds, requireChannel } from './chat.access';
import { excerpt, messageInclude, toMessageDTO } from './chat.mapper';

async function loadMessage(db: Tx, id: string): Promise<MessageDTO> {
  return toMessageDTO(await db.message.findUniqueOrThrow({ where: { id }, include: messageInclude }));
}

/** Pushes to every participant's user room, so the sidebar badge updates on any page. */
async function broadcast(channel: Channel, event: 'chat:message' | 'chat:message-updated', message: MessageDTO) {
  realtime.toUsers(await channelParticipantIds(channel), event, { channelId: channel.id, message });
}

/** Mentions only exist in project channels, and only project members can be mentioned. */
async function validMentionIds(tx: Tx, channel: Channel, ids: readonly string[]): Promise<string[]> {
  if (channel.type !== 'PROJECT' || !channel.projectId || ids.length === 0) return [];
  const members = await tx.projectMember.findMany({
    where: { projectId: channel.projectId, userId: { in: [...new Set(ids)] }, user: { deactivatedAt: null } },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

async function notifyMentions(
  tx: Tx,
  afterCommit: AfterCommit,
  actor: Actor,
  channel: Channel,
  userIds: string[],
  body: string,
) {
  if (userIds.length === 0 || !channel.projectId) return;
  const project = await tx.project.findUniqueOrThrow({ where: { id: channel.projectId }, select: { name: true } });
  const drafts: NotificationDraft[] = userIds.map((userId) => ({
    userId,
    type: 'CHAT_MENTION',
    actorId: actor.userId,
    projectId: channel.projectId!,
    data: { channelId: channel.id, channelName: project.name, projectName: project.name, excerpt: excerpt(body) },
  }));
  await notify(tx, afterCommit, drafts);
}

export async function listMessages(
  actor: Actor,
  channelId: string,
  query: { before?: string; limit: number },
): Promise<MessagePage> {
  await requireChannel(actor, channelId, 'read');
  if (query.before) {
    const anchor = await prisma.message.findFirst({ where: { id: query.before, channelId }, select: { id: true } });
    if (!anchor) throw badRequest('Cursor tidak valid');
  }

  const rows = await prisma.message.findMany({
    where: { channelId },
    include: messageInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.before && { cursor: { id: query.before }, skip: 1 }),
  });
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  return {
    items: page.reverse().map(toMessageDTO),
    nextCursor: hasMore ? (page[0]?.id ?? null) : null,
  };
}

/**
 * Sends a message (FR-31/32). Idempotent on (author, clientMessageId): a client retrying
 * after a dropped connection gets the original message back instead of a duplicate.
 */
export async function sendMessage(
  actor: Actor,
  channelId: string,
  input: SendMessageInput,
): Promise<{ message: MessageDTO; created: boolean }> {
  const { channel } = await requireChannel(actor, channelId, 'post');

  const existing = await prisma.message.findUnique({
    where: { authorId_clientMessageId: { authorId: actor.userId, clientMessageId: input.clientMessageId } },
    include: messageInclude,
  });
  if (existing) {
    if (existing.channelId !== channelId) throw conflict('clientMessageId sudah dipakai');
    return { message: toMessageDTO(existing), created: false };
  }

  const body = stripHtml(input.body ?? '').trim();
  const attachmentIds = [...new Set(input.attachmentIds ?? [])];
  if (!body && attachmentIds.length === 0) throw badRequest('Pesan kosong');
  if (attachmentIds.length > 0 && channel.type !== 'PROJECT') {
    throw badRequest('Lampiran hanya bisa dikirim di chat project');
  }

  try {
    const message = await transactional(async (tx, afterCommit) => {
      if (input.replyToId) {
        const parent = await tx.message.findFirst({ where: { id: input.replyToId, channelId } });
        if (!parent) throw badRequest('Pesan yang dibalas tidak ditemukan');
      }
      const mentionIds = (await validMentionIds(tx, channel, input.mentionIds ?? [])).filter((id) => id !== actor.userId);

      const created = await tx.message.create({
        data: {
          channelId,
          authorId: actor.userId,
          clientMessageId: input.clientMessageId,
          body,
          replyToId: input.replyToId ?? null,
          mentions: { create: mentionIds.map((userId) => ({ userId })) },
        },
      });

      if (attachmentIds.length > 0) {
        // Only the sender's own finished, unattached uploads from this project qualify.
        const { count } = await tx.attachment.updateMany({
          where: {
            id: { in: attachmentIds },
            uploaderId: actor.userId,
            projectId: channel.projectId!,
            status: 'READY',
            deletedAt: null,
            cardId: null,
            commentId: null,
            messageId: null,
          },
          data: { messageId: created.id },
        });
        if (count !== attachmentIds.length) throw badRequest('Lampiran tidak valid');
      }

      await tx.channel.update({ where: { id: channelId }, data: { lastMessageAt: created.createdAt } });
      // Sending implies having read everything up to this message.
      await tx.channelMember.upsert({
        where: { channelId_userId: { channelId, userId: actor.userId } },
        create: { channelId, userId: actor.userId, lastReadAt: created.createdAt },
        update: { lastReadAt: created.createdAt },
      });
      await notifyMentions(tx, afterCommit, actor, channel, mentionIds, body);

      const dto = await loadMessage(tx, created.id);
      afterCommit(() => broadcast(channel, 'chat:message', dto));
      return dto;
    });
    return { message, created: true };
  } catch (err) {
    // Two concurrent retries with the same clientMessageId: the other request won.
    if (!isUniqueViolation(err)) throw err;
    const winner = await prisma.message.findUniqueOrThrow({
      where: { authorId_clientMessageId: { authorId: actor.userId, clientMessageId: input.clientMessageId } },
      include: messageInclude,
    });
    return { message: toMessageDTO(winner), created: false };
  }
}

/** Loads a live message and authorizes against its channel (404 when either is invisible). */
async function requireMessage(actor: Actor, messageId: string, level: 'read' | 'post') {
  const message = await prisma.message.findFirst({ where: { id: messageId, deletedAt: null } });
  if (!message) throw notFound('Pesan');
  const access = await requireChannel(actor, message.channelId, level).catch(() => {
    throw notFound('Pesan');
  });
  return { message, ...access };
}

/** Authors edit their own messages (FR-34); newly added mentions are notified. */
export async function editMessage(actor: Actor, messageId: string, input: EditMessageInput): Promise<MessageDTO> {
  const { message, channel, canPost } = await requireMessage(actor, messageId, 'read');
  if (message.authorId !== actor.userId) throw forbidden('Hanya pengirim yang bisa mengubah pesan');
  if (!canPost) throw forbidden('Anda tidak bisa mengubah pesan di percakapan ini');
  const body = stripHtml(input.body).trim();
  if (!body) throw badRequest('Pesan kosong');

  return transactional(async (tx, afterCommit) => {
    const mentionIds = (await validMentionIds(tx, channel, input.mentionIds ?? [])).filter((id) => id !== actor.userId);
    const previous = new Set(
      (await tx.messageMention.findMany({ where: { messageId }, select: { userId: true } })).map((m) => m.userId),
    );
    await tx.messageMention.deleteMany({ where: { messageId } });
    await tx.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date(), mentions: { create: mentionIds.map((userId) => ({ userId })) } },
    });
    await notifyMentions(tx, afterCommit, actor, channel, mentionIds.filter((id) => !previous.has(id)), body);

    const dto = await loadMessage(tx, messageId);
    afterCommit(() => broadcast(channel, 'chat:message-updated', dto));
    return dto;
  });
}

/** Soft delete (FR-34): the author, or a project manager moderating their channel. */
export async function deleteMessage(actor: Actor, messageId: string): Promise<MessageDTO> {
  const { message, channel, canModerate } = await requireMessage(actor, messageId, 'read');
  if (message.authorId !== actor.userId && !canModerate) throw forbidden();

  return transactional(async (tx, afterCommit) => {
    const now = new Date();
    await tx.message.update({ where: { id: messageId }, data: { deletedAt: now } });
    await tx.attachment.updateMany({ where: { messageId }, data: { deletedAt: now } });
    const dto = await loadMessage(tx, messageId);
    afterCommit(() => broadcast(channel, 'chat:message-updated', dto));
    return dto;
  });
}

/** Toggles the actor's reaction with `emoji` (FR-31). */
export async function toggleReaction(actor: Actor, messageId: string, emoji: string): Promise<MessageDTO> {
  const { channel } = await requireMessage(actor, messageId, 'post');
  const key = { messageId_userId_emoji: { messageId, userId: actor.userId, emoji } };

  return transactional(async (tx, afterCommit) => {
    const existing = await tx.messageReaction.findUnique({ where: key });
    if (existing) await tx.messageReaction.delete({ where: key });
    else await tx.messageReaction.create({ data: { messageId, userId: actor.userId, emoji } });

    const dto = await loadMessage(tx, messageId);
    afterCommit(() => broadcast(channel, 'chat:message-updated', dto));
    return dto;
  });
}
