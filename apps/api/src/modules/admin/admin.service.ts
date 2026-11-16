import { prisma, toUserSummary, userSummarySelect, type Prisma, type Tx } from '@nexus/db';
import { canAssignOrgRole, type AdminUserDTO, type OrgRole } from '@nexus/shared';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import type { Actor } from '../access/actor';
import { requireOrgAdmin } from '../access/access.service';
import { revokeUserSessions } from '../auth/session.service';
import { writeAudit } from './audit';

const adminUserSelect = {
  ...userSummarySelect,
  emailVerifiedAt: true,
  deactivatedAt: true,
  createdAt: true,
  orgMemberships: { select: { role: true }, take: 1 },
  _count: {
    select: {
      sessions: { where: { revokedAt: null } },
      assignments: { where: { card: { archivedAt: null, completedAt: null } } },
    },
  },
} satisfies Prisma.UserSelect;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

function toDTO(row: AdminUserRow): AdminUserDTO {
  return {
    ...toUserSummary(row),
    orgRole: row.orgMemberships[0]?.role ?? 'MEMBER',
    emailVerified: row.emailVerifiedAt !== null,
    deactivatedAt: row.deactivatedAt?.toISOString() ?? null,
    activeSessionCount: row._count.sessions,
    openTaskCount: row._count.assignments,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadUser(actor: Actor, userId: string): Promise<AdminUserDTO> {
  const row = await prisma.user.findFirst({
    where: { id: userId, orgMemberships: { some: { orgId: actor.orgId } } },
    select: adminUserSelect,
  });
  if (!row) throw notFound('User');
  return toDTO(row);
}

export async function listUsers(actor: Actor, query: { q?: string; status?: 'active' | 'deactivated' }): Promise<AdminUserDTO[]> {
  requireOrgAdmin(actor);
  const rows = await prisma.user.findMany({
    where: {
      orgMemberships: { some: { orgId: actor.orgId } },
      ...(query.status === 'active' && { deactivatedAt: null }),
      ...(query.status === 'deactivated' && { deactivatedAt: { not: null } }),
      ...(query.q && {
        OR: [
          // Case-insensitive through the column's default utf8mb4 collation.
          { name: { contains: query.q } },
          { email: { contains: query.q } },
        ],
      }),
    },
    select: adminUserSelect,
    orderBy: { name: 'asc' },
  });
  return rows.map(toDTO);
}

/**
 * Loads the target and checks the actor outranks them: nobody manages themselves,
 * the Owner is untouchable, and Admins cannot manage other Admins.
 */
async function requireManageableUser(actor: Actor, userId: string) {
  requireOrgAdmin(actor);
  if (userId === actor.userId) throw forbidden('Anda tidak bisa mengubah akun sendiri di sini');
  const membership = await prisma.orgMember.findFirst({ where: { orgId: actor.orgId, userId } });
  if (!membership) throw notFound('User');
  if (membership.role === 'OWNER' || !canAssignOrgRole(actor.orgRole, membership.role)) throw forbidden();
  return membership;
}

/** Keeps division/project roles consistent with a lowered org role. */
async function cascadeRoleDowngrade(tx: Tx, userId: string, role: OrgRole) {
  if (role === 'GUEST') {
    await tx.divisionMember.deleteMany({ where: { userId } });
    await tx.projectMember.updateMany({ where: { userId, role: 'ADMIN' }, data: { role: 'MEMBER' } });
  } else if (role === 'MEMBER') {
    await tx.divisionMember.updateMany({ where: { userId, role: 'LEAD' }, data: { role: 'MEMBER' } });
  }
}

export async function setOrgRole(actor: Actor, userId: string, role: OrgRole, ip: string | null): Promise<AdminUserDTO> {
  const membership = await requireManageableUser(actor, userId);
  if (!canAssignOrgRole(actor.orgRole, role) || role === 'OWNER') {
    throw forbidden('Anda tidak bisa memberikan role tersebut');
  }
  await prisma.$transaction(async (tx) => {
    await tx.orgMember.update({ where: { id: membership.id }, data: { role } });
    await cascadeRoleDowngrade(tx, userId, role);
  });
  await writeAudit(actor, 'user.role_changed', 'User', userId, { from: membership.role, to: role }, ip);
  return loadUser(actor, userId);
}

/**
 * Deactivates an account (FR-47) without deleting its work (FR-48): open assignments are
 * moved to `transferToUserId` (who is added to the affected projects if needed), and
 * every session is revoked immediately.
 */
export async function deactivateUser(
  actor: Actor,
  userId: string,
  transferToUserId: string | null,
  ip: string | null,
): Promise<AdminUserDTO> {
  await requireManageableUser(actor, userId);
  if (transferToUserId === userId) throw badRequest('Tidak bisa memindahkan task ke user yang sama');
  if (transferToUserId) {
    const target = await prisma.orgMember.findFirst({
      where: { orgId: actor.orgId, userId: transferToUserId, user: { deactivatedAt: null } },
    });
    if (!target) throw notFound('User tujuan');
  }

  let transferred = 0;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { deactivatedAt: new Date() } });
    if (!transferToUserId) return;

    const assignments = await tx.cardAssignee.findMany({
      where: { userId, card: { archivedAt: null, completedAt: null } },
      select: { cardId: true, card: { select: { projectId: true } } },
    });
    transferred = assignments.length;

    for (const projectId of new Set(assignments.map((a) => a.card.projectId))) {
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: transferToUserId } },
        create: { projectId, userId: transferToUserId, role: 'MEMBER' },
        update: {},
      });
    }
    for (const { cardId } of assignments) {
      await tx.cardAssignee.delete({ where: { cardId_userId: { cardId, userId } } });
      await tx.cardAssignee.upsert({
        where: { cardId_userId: { cardId, userId: transferToUserId } },
        create: { cardId, userId: transferToUserId },
        update: {},
      });
    }
  });

  await revokeUserSessions(userId);
  await writeAudit(actor, 'user.deactivated', 'User', userId, { transferToUserId, transferred }, ip);
  return loadUser(actor, userId);
}

export async function reactivateUser(actor: Actor, userId: string, ip: string | null): Promise<AdminUserDTO> {
  await requireManageableUser(actor, userId);
  await prisma.user.update({ where: { id: userId }, data: { deactivatedAt: null } });
  await writeAudit(actor, 'user.reactivated', 'User', userId, {}, ip);
  return loadUser(actor, userId);
}

export async function revokeSessionsOf(actor: Actor, userId: string, ip: string | null): Promise<void> {
  await requireManageableUser(actor, userId);
  await revokeUserSessions(userId);
  await writeAudit(actor, 'user.sessions_revoked', 'User', userId, {}, ip);
}
