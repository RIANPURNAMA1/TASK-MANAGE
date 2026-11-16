import { prisma, toUserSummary, userSummarySelect, type Prisma } from '@nexus/db';
import {
  isOrgAdmin,
  type CreateDivisionInput,
  type DivisionDTO,
  type DivisionMemberDTO,
  type DivisionMemberInput,
  type DivisionRole,
  type UpdateDivisionInput,
} from '@nexus/shared';
import { badRequest, notFound } from '../../lib/errors';
import type { Actor } from '../access/actor';
import { requireDivision, requireOrgAdmin } from '../access/access.service';
import { canHoldDivisionRole, canManageDivision } from '../access/policy';

function divisionInclude(actor: Actor) {
  return {
    members: { where: { userId: actor.userId }, select: { role: true } },
    _count: {
      select: {
        members: true,
        projects: { where: { archivedAt: null } },
      },
    },
  } satisfies Prisma.DivisionInclude;
}

type DivisionRow = Prisma.DivisionGetPayload<{ include: ReturnType<typeof divisionInclude> }>;

function toDTO(actor: Actor, row: DivisionRow): DivisionDTO {
  const myRole = row.members[0]?.role ?? null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    memberCount: row._count.members,
    projectCount: row._count.projects,
    myRole,
    canManage: canManageDivision({ orgRole: actor.orgRole, divisionRole: myRole }),
  };
}

export async function listDivisions(actor: Actor): Promise<DivisionDTO[]> {
  if (actor.orgRole === 'GUEST') return [];
  const rows = await prisma.division.findMany({
    where: {
      orgId: actor.orgId,
      archivedAt: null,
      ...(!isOrgAdmin(actor.orgRole) && { members: { some: { userId: actor.userId } } }),
    },
    include: divisionInclude(actor),
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => toDTO(actor, row));
}

async function getDivisionDTO(actor: Actor, id: string): Promise<DivisionDTO> {
  const row = await prisma.division.findUniqueOrThrow({ where: { id }, include: divisionInclude(actor) });
  return toDTO(actor, row);
}

export async function createDivision(actor: Actor, input: CreateDivisionInput): Promise<DivisionDTO> {
  requireOrgAdmin(actor);
  const division = await prisma.division.create({ data: { ...input, orgId: actor.orgId } });
  return getDivisionDTO(actor, division.id);
}

export async function updateDivision(actor: Actor, id: string, input: UpdateDivisionInput): Promise<DivisionDTO> {
  await requireDivision(actor, id, 'manage');
  await prisma.division.update({ where: { id }, data: input });
  return getDivisionDTO(actor, id);
}

/** Archiving hides the division and all of its projects; data is kept (soft delete). */
export async function archiveDivision(actor: Actor, id: string): Promise<void> {
  requireOrgAdmin(actor);
  await requireDivision(actor, id, 'view');
  await prisma.division.update({ where: { id }, data: { archivedAt: new Date() } });
}

// ─── members ──────────────────────────────────────────────────────────

const memberInclude = {
  user: { select: { ...userSummarySelect, orgMemberships: { select: { role: true }, take: 1 } } },
} satisfies Prisma.DivisionMemberInclude;

type MemberRow = Prisma.DivisionMemberGetPayload<{ include: typeof memberInclude }>;

function toMemberDTO(row: MemberRow): DivisionMemberDTO {
  return {
    user: toUserSummary(row.user),
    role: row.role,
    orgRole: row.user.orgMemberships[0]?.role ?? 'MEMBER',
  };
}

export async function listDivisionMembers(actor: Actor, divisionId: string): Promise<DivisionMemberDTO[]> {
  await requireDivision(actor, divisionId, 'view');
  const rows = await prisma.divisionMember.findMany({
    where: { divisionId, user: { deactivatedAt: null } },
    include: memberInclude,
    orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
  });
  return rows.map(toMemberDTO);
}

async function assertEligible(actor: Actor, userId: string, role: DivisionRole) {
  const membership = await prisma.orgMember.findFirst({
    where: { orgId: actor.orgId, userId, user: { deactivatedAt: null } },
  });
  if (!membership) throw notFound('User');
  if (!canHoldDivisionRole(membership.role, role)) {
    throw badRequest(
      membership.role === 'GUEST'
        ? 'Guest tidak bisa menjadi anggota divisi'
        : 'Hanya user dengan role Division Lead ke atas yang bisa memimpin divisi',
    );
  }
}

export async function addDivisionMember(actor: Actor, divisionId: string, input: DivisionMemberInput): Promise<DivisionMemberDTO> {
  await requireDivision(actor, divisionId, 'manage');
  await assertEligible(actor, input.userId, input.role);
  const row = await prisma.divisionMember.upsert({
    where: { divisionId_userId: { divisionId, userId: input.userId } },
    create: { divisionId, userId: input.userId, role: input.role },
    update: { role: input.role },
    include: memberInclude,
  });
  return toMemberDTO(row);
}

export async function updateDivisionMember(actor: Actor, divisionId: string, userId: string, role: DivisionRole): Promise<DivisionMemberDTO> {
  await requireDivision(actor, divisionId, 'manage');
  await assertEligible(actor, userId, role);
  const row = await prisma.divisionMember.update({
    where: { divisionId_userId: { divisionId, userId } },
    data: { role },
    include: memberInclude,
  });
  return toMemberDTO(row);
}

export async function removeDivisionMember(actor: Actor, divisionId: string, userId: string): Promise<void> {
  await requireDivision(actor, divisionId, 'manage');
  const { count } = await prisma.divisionMember.deleteMany({ where: { divisionId, userId } });
  if (count === 0) throw notFound('Anggota');
}
