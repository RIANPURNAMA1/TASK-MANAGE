import { prisma, toUserSummary, userSummarySelect, type Prisma } from '@nexus/db';
import type { ChannelDetail, ChannelDTO, ChannelMemberDTO } from '@nexus/shared';
import { badRequest, notFound } from '../../lib/errors';
import { isUniqueViolation } from '../../lib/prisma-errors';
import { realtime } from '../../realtime/emitter';
import type { Actor } from '../access/actor';
import { requireProject, visibleProjectsWhere } from '../access/access.service';
import { canDirectMessage, channelParticipantIds, requireChannel } from './chat.access';
import { excerpt } from './chat.mapper';

const channelInclude = {
  project: { select: { id: true, name: true, color: true } },
  members: { include: { user: { select: { ...userSummarySelect, deactivatedAt: true } } } },
  messages: {
    where: { deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 1,
    include: { author: { select: { name: true } } },
  },
} satisfies Prisma.ChannelInclude;

type ChannelRow = Prisma.ChannelGetPayload<{ include: typeof channelInclude }>;

async function unreadCount(channelId: string, userId: string, lastReadAt: Date | null): Promise<number> {
  return prisma.message.count({
    where: {
      channelId,
      deletedAt: null,
      authorId: { not: userId },
      ...(lastReadAt && { createdAt: { gt: lastReadAt } }),
    },
  });
}

async function toChannelDTO(actor: Actor, row: ChannelRow, canPost: boolean): Promise<ChannelDTO> {
  const me = row.members.find((m) => m.userId === actor.userId);
  const peer = row.type === 'DIRECT' ? row.members.find((m) => m.userId !== actor.userId)?.user : undefined;
  const last = row.messages[0];

  return {
    id: row.id,
    type: row.type,
    name: row.project?.name ?? peer?.name ?? 'Percakapan',
    project: row.project,
    peer: peer ? toUserSummary(peer) : null,
    unreadCount: await unreadCount(row.id, actor.userId, me?.lastReadAt ?? null),
    lastMessage: last
      ? { id: last.id, authorName: last.author.name, body: excerpt(last.body, 80), createdAt: last.createdAt.toISOString() }
      : null,
    lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
    canPost,
  };
}

/** Project channels are created lazily the first time anyone lists or opens them. */
async function ensureProjectChannels(projectIds: string[]): Promise<void> {
  if (projectIds.length === 0) return;
  await prisma.channel.createMany({
    data: projectIds.map((projectId) => ({ type: 'PROJECT' as const, projectId })),
    skipDuplicates: true,
  });
}

/**
 * The sidebar (FR-31/32): channels of the projects the actor is a member of, plus their
 * direct conversations, most recently active first.
 */
export async function listChannels(actor: Actor): Promise<ChannelDTO[]> {
  const projects = await prisma.project.findMany({
    where: { AND: [visibleProjectsWhere(actor), { archivedAt: null, members: { some: { userId: actor.userId } } }] },
    select: { id: true, members: { where: { userId: actor.userId }, select: { role: true } } },
  });
  await ensureProjectChannels(projects.map((p) => p.id));

  const rows = await prisma.channel.findMany({
    where: {
      OR: [
        { type: 'PROJECT', projectId: { in: projects.map((p) => p.id) } },
        { type: 'DIRECT', members: { some: { userId: actor.userId } } },
      ],
    },
    include: channelInclude,
  });

  const channels = await Promise.all(
    rows.map((row) => {
      // Listed project channels are the actor's own projects (member ⇒ can post);
      // a DM is writable while the other person is active.
      const peer = row.members.find((m) => m.userId !== actor.userId);
      const canPost = row.type === 'PROJECT' || Boolean(peer && !peer.user.deactivatedAt);
      return toChannelDTO(actor, row, canPost);
    }),
  );

  const activity = (c: ChannelDTO) => c.lastMessageAt ?? '';
  return channels.sort((a, b) => activity(b).localeCompare(activity(a)) || a.name.localeCompare(b.name));
}

export async function getChannel(actor: Actor, channelId: string): Promise<ChannelDetail> {
  const { channel, canPost } = await requireChannel(actor, channelId, 'read');
  const row = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, include: channelInclude });

  let members: ChannelMemberDTO[];
  if (channel.type === 'PROJECT' && channel.projectId) {
    const projectMembers = await prisma.projectMember.findMany({
      where: { projectId: channel.projectId, user: { deactivatedAt: null } },
      include: { user: { select: userSummarySelect } },
      orderBy: { user: { name: 'asc' } },
    });
    const readAt = new Map(row.members.map((m) => [m.userId, m.lastReadAt]));
    members = projectMembers.map((m) => ({
      user: toUserSummary(m.user),
      lastReadAt: readAt.get(m.userId)?.toISOString() ?? null,
    }));
  } else {
    members = row.members.map((m) => ({ user: toUserSummary(m.user), lastReadAt: m.lastReadAt?.toISOString() ?? null }));
  }

  return { ...(await toChannelDTO(actor, row, canPost)), members };
}

export async function getProjectChannel(actor: Actor, projectId: string): Promise<ChannelDTO> {
  const { access } = await requireProject(actor, projectId, 'canView');
  await ensureProjectChannels([projectId]);
  const row = await prisma.channel.findUniqueOrThrow({ where: { projectId }, include: channelInclude });
  return toChannelDTO(actor, row, access.canEdit);
}

/** Gets or creates the single 1-on-1 channel between the actor and `userId` (FR-32). */
export async function openDirectChannel(actor: Actor, userId: string): Promise<ChannelDTO> {
  if (userId === actor.userId) throw badRequest('Tidak bisa mengirim pesan ke diri sendiri');
  if (!(await canDirectMessage(actor, userId))) throw notFound('User');

  const directKey = [actor.userId, userId].sort().join(':');
  const existing = await prisma.channel.findUnique({ where: { directKey }, select: { id: true } });
  const channelId =
    existing?.id ??
    (await prisma.channel
      .create({
        data: {
          type: 'DIRECT',
          directKey,
          members: { create: [{ userId: actor.userId }, { userId }] },
        },
      })
      .then((c) => c.id)
      // Both people opened the conversation at the same moment: use the winner's row.
      .catch(async (err: unknown) => {
        if (!isUniqueViolation(err)) throw err;
        return (await prisma.channel.findUniqueOrThrow({ where: { directKey } })).id;
      }));

  const row = await prisma.channel.findUniqueOrThrow({ where: { id: channelId }, include: channelInclude });
  return toChannelDTO(actor, row, true);
}

/** Moves the actor's read marker to now (FR-33) and tells the other participants. */
export async function markChannelRead(actor: Actor, channelId: string): Promise<void> {
  const { channel } = await requireChannel(actor, channelId, 'read');
  const lastReadAt = new Date();
  await prisma.channelMember.upsert({
    where: { channelId_userId: { channelId, userId: actor.userId } },
    create: { channelId, userId: actor.userId, lastReadAt },
    update: { lastReadAt },
  });
  realtime.toUsers(await channelParticipantIds(channel), 'chat:read', {
    channelId,
    userId: actor.userId,
    lastReadAt: lastReadAt.toISOString(),
  });
}

export function onlineUsers(actor: Actor): Promise<string[]> {
  return realtime.onlineUserIds(actor.orgId);
}
