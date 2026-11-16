import { prisma, toUserSummary, userSummarySelect, type Prisma } from '@nexus/db';
import {
  positionAfter,
  type CreateProjectInput,
  type ProjectDTO,
  type ProjectMemberDTO,
  type ProjectMemberInput,
  type ProjectRole,
  type UpdateProjectInput,
} from '@nexus/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { transactional } from '../../lib/transaction';
import { realtime } from '../../realtime/emitter';
import type { Actor } from '../access/actor';
import { requireDivision, requireProject, visibleProjectsWhere } from '../access/access.service';
import { canHoldProjectRole } from '../access/policy';
import { diffFields, recordActivity } from '../activity/activity.service';
import { projectInclude, toProjectDTO } from './project.mapper';

const DEFAULT_LISTS = ['To Do', 'In Progress', 'Review', 'Done'];

export async function listProjects(
  actor: Actor,
  filter: { divisionId?: string; archived?: boolean },
): Promise<ProjectDTO[]> {
  const rows = await prisma.project.findMany({
    where: {
      AND: [
        visibleProjectsWhere(actor),
        { archivedAt: filter.archived ? { not: null } : null },
        filter.divisionId ? { divisionId: filter.divisionId } : {},
      ],
    },
    include: projectInclude(actor),
    orderBy: { name: 'asc' },
  });
  return rows.map((row) => toProjectDTO(actor, row));
}

export async function getProject(actor: Actor, projectId: string): Promise<ProjectDTO> {
  await requireProject(actor, projectId, 'canView');
  const row = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: projectInclude(actor) });
  return toProjectDTO(actor, row);
}

/** Division Leads (and admins) create projects; the creator becomes Project Admin. */
export async function createProject(actor: Actor, input: CreateProjectInput): Promise<ProjectDTO> {
  await requireDivision(actor, input.divisionId, 'manage');

  const projectId = await transactional(async (tx) => {
    const project = await tx.project.create({
      data: { ...input, createdById: actor.userId, members: { create: { userId: actor.userId, role: 'ADMIN' } } },
    });
    let position: string | null = null;
    for (const name of DEFAULT_LISTS) {
      position = positionAfter(position);
      await tx.boardList.create({ data: { projectId: project.id, name, position } });
    }
    await recordActivity(tx, {
      projectId: project.id,
      actorId: actor.userId,
      entityType: 'project',
      entityId: project.id,
      action: 'project.created',
      diff: { name: project.name },
    });
    return project.id;
  });

  return getProject(actor, projectId);
}

export async function updateProject(actor: Actor, projectId: string, input: UpdateProjectInput): Promise<ProjectDTO> {
  await requireProject(actor, projectId, 'canManage');
  await transactional(async (tx, afterCommit) => {
    const before = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
    await tx.project.update({ where: { id: projectId }, data: input });
    await recordActivity(tx, {
      projectId,
      actorId: actor.userId,
      entityType: 'project',
      entityId: projectId,
      action: 'project.updated',
      diff: diffFields(before, input),
    });
    afterCommit(() => realtime.toProject(projectId, 'project:changed', { projectId }));
  });
  return getProject(actor, projectId);
}

export async function setProjectArchived(actor: Actor, projectId: string, archived: boolean): Promise<ProjectDTO> {
  await requireProject(actor, projectId, 'canManage');
  await transactional(async (tx, afterCommit) => {
    await tx.project.update({ where: { id: projectId }, data: { archivedAt: archived ? new Date() : null } });
    await recordActivity(tx, {
      projectId,
      actorId: actor.userId,
      entityType: 'project',
      entityId: projectId,
      action: archived ? 'project.archived' : 'project.restored',
    });
    afterCommit(() => realtime.toProject(projectId, 'project:changed', { projectId }));
  });
  return getProject(actor, projectId);
}

/** A division member turns read access to a public project into membership. */
export async function joinProject(actor: Actor, projectId: string): Promise<ProjectDTO> {
  const { access } = await requireProject(actor, projectId, 'canView');
  if (access.canEdit) throw conflict('Anda sudah menjadi anggota project ini');
  await prisma.projectMember.create({ data: { projectId, userId: actor.userId, role: 'MEMBER' } });
  return getProject(actor, projectId);
}

export async function setProjectMuted(actor: Actor, projectId: string, muted: boolean): Promise<ProjectDTO> {
  await requireProject(actor, projectId, 'canView');
  const key = { projectId_userId: { projectId, userId: actor.userId } };
  if (muted) {
    await prisma.projectMute.upsert({ where: key, create: { projectId, userId: actor.userId }, update: {} });
  } else {
    await prisma.projectMute.deleteMany({ where: { projectId, userId: actor.userId } });
  }
  return getProject(actor, projectId);
}

// ─── members ──────────────────────────────────────────────────────────

const memberInclude = { user: { select: userSummarySelect } } satisfies Prisma.ProjectMemberInclude;

function toMemberDTO(row: Prisma.ProjectMemberGetPayload<{ include: typeof memberInclude }>): ProjectMemberDTO {
  return { user: toUserSummary(row.user), role: row.role };
}

export async function listProjectMembers(actor: Actor, projectId: string): Promise<ProjectMemberDTO[]> {
  await requireProject(actor, projectId, 'canView');
  const rows = await prisma.projectMember.findMany({
    where: { projectId, user: { deactivatedAt: null } },
    include: memberInclude,
    orderBy: [{ role: 'asc' }, { user: { name: 'asc' } }],
  });
  return rows.map(toMemberDTO);
}

async function assertCanHold(actor: Actor, userId: string, role: ProjectRole) {
  const membership = await prisma.orgMember.findFirst({
    where: { orgId: actor.orgId, userId, user: { deactivatedAt: null } },
  });
  if (!membership) throw notFound('User');
  if (!canHoldProjectRole(membership.role, role)) throw badRequest('Guest tidak bisa menjadi Project Admin');
}

export async function addProjectMember(actor: Actor, projectId: string, input: ProjectMemberInput): Promise<ProjectMemberDTO> {
  await requireProject(actor, projectId, 'canManage');
  await assertCanHold(actor, input.userId, input.role);

  return transactional(async (tx, afterCommit) => {
    const row = await tx.projectMember.upsert({
      where: { projectId_userId: { projectId, userId: input.userId } },
      create: { projectId, userId: input.userId, role: input.role },
      update: { role: input.role },
      include: memberInclude,
    });
    await recordActivity(tx, {
      projectId,
      actorId: actor.userId,
      entityType: 'member',
      entityId: input.userId,
      action: 'member.added',
      diff: { name: row.user.name, role: input.role },
    });
    afterCommit(() => realtime.toProject(projectId, 'project:changed', { projectId }));
    return toMemberDTO(row);
  });
}

export async function updateProjectMember(actor: Actor, projectId: string, userId: string, role: ProjectRole): Promise<ProjectMemberDTO> {
  await requireProject(actor, projectId, 'canManage');
  await assertCanHold(actor, userId, role);
  await assertNotLastAdmin(projectId, userId, role);
  const row = await prisma.projectMember.update({
    where: { projectId_userId: { projectId, userId } },
    data: { role },
    include: memberInclude,
  });
  return toMemberDTO(row);
}

/** Members may leave on their own; removing others requires manage rights. */
export async function removeProjectMember(actor: Actor, projectId: string, userId: string): Promise<void> {
  const isSelf = userId === actor.userId;
  await requireProject(actor, projectId, isSelf ? 'canView' : 'canManage');
  await assertNotLastAdmin(projectId, userId, null);

  await transactional(async (tx, afterCommit) => {
    const { count } = await tx.projectMember.deleteMany({ where: { projectId, userId } });
    if (count === 0) throw notFound('Anggota');
    // Assignments only make sense for members.
    await tx.cardAssignee.deleteMany({ where: { userId, card: { projectId } } });
    await recordActivity(tx, {
      projectId,
      actorId: actor.userId,
      entityType: 'member',
      entityId: userId,
      action: 'member.removed',
    });
    afterCommit(() => realtime.toProject(projectId, 'project:changed', { projectId }));
  });
}

/** A project must always keep at least one Project Admin. */
async function assertNotLastAdmin(projectId: string, userId: string, newRole: ProjectRole | null) {
  if (newRole === 'ADMIN') return;
  const current = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  if (current?.role !== 'ADMIN') return;
  const admins = await prisma.projectMember.count({ where: { projectId, role: 'ADMIN' } });
  if (admins <= 1) throw forbidden('Project harus memiliki minimal satu Project Admin');
}
