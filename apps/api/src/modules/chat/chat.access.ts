import { prisma, type Channel } from '@nexus/db';
import { forbidden, notFound } from '../../lib/errors';
import type { Actor } from '../access/actor';
import { getProjectAccess } from '../access/access.service';

export interface ChannelAccess {
  channel: Channel;
  canPost: boolean;
  /** Project channels: the actor manages the project (may delete others' messages). */
  canModerate: boolean;
}

/**
 * Chat authorization (PRD §8 applies to chat too):
 * - PROJECT channel: read = can view the project, post = can edit it.
 * - DIRECT channel: only its two members; posting stops once the other person is deactivated.
 * Unknown or invisible channels are reported as 404.
 */
export async function getChannelAccess(actor: Actor, channelId: string): Promise<ChannelAccess | null> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;

  if (channel.type === 'PROJECT') {
    if (!channel.projectId) return null;
    const result = await getProjectAccess(actor, channel.projectId);
    if (!result?.access.canView) return null;
    return { channel, canPost: result.access.canEdit, canModerate: result.access.canManage };
  }

  const members = await prisma.channelMember.findMany({
    where: { channelId },
    select: { userId: true, user: { select: { deactivatedAt: true } } },
  });
  if (!members.some((m) => m.userId === actor.userId)) return null;
  const peer = members.find((m) => m.userId !== actor.userId);
  return { channel, canPost: Boolean(peer && !peer.user.deactivatedAt), canModerate: false };
}

export async function requireChannel(actor: Actor, channelId: string, level: 'read' | 'post'): Promise<ChannelAccess> {
  const access = await getChannelAccess(actor, channelId);
  if (!access) throw notFound('Percakapan');
  if (level === 'post' && !access.canPost) throw forbidden('Anda tidak bisa mengirim pesan di percakapan ini');
  return access;
}

/**
 * Who receives real-time events of a channel: project members plus anyone who has opened
 * the channel (read-only viewers get a ChannelMember row on first visit), or the DM pair.
 */
export async function channelParticipantIds(channel: Pick<Channel, 'id' | 'type' | 'projectId'>): Promise<string[]> {
  const [members, projectMembers] = await Promise.all([
    prisma.channelMember.findMany({ where: { channelId: channel.id }, select: { userId: true } }),
    channel.type === 'PROJECT' && channel.projectId
      ? prisma.projectMember.findMany({ where: { projectId: channel.projectId }, select: { userId: true } })
      : Promise.resolve([]),
  ]);
  return [...new Set([...members, ...projectMembers].map((m) => m.userId))];
}

/** Guests may only message people they share a project with; everyone else, any active colleague. */
export async function canDirectMessage(actor: Actor, userId: string): Promise<boolean> {
  if (userId === actor.userId) return false;
  const target = await prisma.orgMember.findFirst({
    where: { orgId: actor.orgId, userId, user: { deactivatedAt: null } },
  });
  if (!target) return false;
  if (actor.orgRole !== 'GUEST' && target.role !== 'GUEST') return true;

  const shared = await prisma.projectMember.count({
    where: { userId, project: { members: { some: { userId: actor.userId } } } },
  });
  return shared > 0;
}
