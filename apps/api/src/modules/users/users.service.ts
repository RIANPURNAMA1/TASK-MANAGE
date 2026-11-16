import { prisma, toUserSummary, userSummarySelect } from '@nexus/db';
import type { ChangePasswordInput, Me, UpdateMeInput, UserSummary } from '@nexus/shared';
import { AppError, notFound, unauthenticated } from '../../lib/errors';
import type { Actor } from '../access/actor';
import { hashPassword, verifyPassword } from '../auth/password';
import { revokeUserSessions } from '../auth/session.service';

export async function loadMe(userId: string): Promise<Me> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { orgMemberships: { include: { organization: true }, take: 1 } },
  });
  const membership = user?.orgMemberships[0];
  if (!user || !membership) throw unauthenticated();

  return {
    ...toUserSummary(user),
    orgRole: membership.role,
    emailDigest: user.emailDigest,
    hasPassword: user.passwordHash !== null,
    organization: { id: membership.organization.id, name: membership.organization.name },
  };
}

export async function updateMe(actor: Actor, input: UpdateMeInput): Promise<Me> {
  await prisma.user.update({ where: { id: actor.userId }, data: input });
  return loadMe(actor.userId);
}

/** Changing the password signs out every other device. */
export async function changePassword(actor: Actor, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new AppError(400, 'INVALID_CREDENTIALS', 'Password saat ini salah');
  }
  await prisma.user.update({
    where: { id: actor.userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });
  await revokeUserSessions(actor.userId, actor.sessionId);
}

/**
 * People the actor may pick (assignee, member invite…). Guests only see the people
 * they already share a project with, so the org directory is not exposed to them.
 */
export async function searchUsers(actor: Actor, q: string | undefined): Promise<UserSummary[]> {
  // Case-insensitive through the column's default utf8mb4 collation.
  const text = q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {};
  const scope =
    actor.orgRole === 'GUEST'
      ? { projectMembers: { some: { project: { members: { some: { userId: actor.userId } } } } } }
      : { orgMemberships: { some: { orgId: actor.orgId } } };

  const users = await prisma.user.findMany({
    where: { deactivatedAt: null, ...scope, ...text },
    select: userSummarySelect,
    orderBy: { name: 'asc' },
    take: 50,
  });
  return users.map(toUserSummary);
}

/** Validates that every id is an active member of the actor's organization. */
export async function assertOrgMembers(actor: Actor, userIds: readonly string[]): Promise<void> {
  if (userIds.length === 0) return;
  const count = await prisma.orgMember.count({
    where: { orgId: actor.orgId, userId: { in: [...userIds] }, user: { deactivatedAt: null } },
  });
  if (count !== new Set(userIds).size) throw notFound('User');
}
