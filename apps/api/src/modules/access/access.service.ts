import { prisma, type Prisma, type Tx } from '@nexus/db';
import { isOrgAdmin, type ProjectAccess } from '@nexus/shared';
import { AppError, forbidden, notFound } from '../../lib/errors';
import type { Actor } from './actor';
import { canManageDivision, canViewDivision, projectAccess } from './policy';

export type AccessLevel = keyof ProjectAccess;

/**
 * Central authorization gateway. Every route touching a project-scoped resource goes
 * through `requireProject` (directly or via `requireCard`, …), and every listing query
 * is filtered with `visibleProjectsWhere` — IDs sent by the client are never trusted
 * on their own (IDOR prevention, PRD §8).
 */

export async function getProjectAccess(
  actor: Actor,
  projectId: string,
  db: Tx = prisma,
): Promise<{ project: { id: string; divisionId: string; name: string }; access: ProjectAccess } | null> {
  const project = await db.project.findFirst({
    where: { id: projectId, division: { orgId: actor.orgId, archivedAt: null } },
    select: {
      id: true,
      name: true,
      divisionId: true,
      isPrivate: true,
      archivedAt: true,
      members: { where: { userId: actor.userId }, select: { role: true } },
      division: {
        select: { members: { where: { userId: actor.userId }, select: { role: true } } },
      },
    },
  });
  if (!project) return null;

  const access = projectAccess({
    orgRole: actor.orgRole,
    divisionRole: project.division.members[0]?.role ?? null,
    projectRole: project.members[0]?.role ?? null,
    isPrivate: project.isPrivate,
    isArchived: project.archivedAt !== null,
  });

  return { project: { id: project.id, divisionId: project.divisionId, name: project.name }, access };
}

/** Throws 404 when the caller cannot see the project (no existence leak), 403 when the level is insufficient. */
export async function requireProject(actor: Actor, projectId: string, level: AccessLevel, db: Tx = prisma) {
  const result = await getProjectAccess(actor, projectId, db);
  if (!result || !result.access.canView) throw notFound('Project');
  if (!result.access[level]) throw forbidden();
  return result;
}

/** Resolves a child entity to its project, then authorizes against that project. */
async function requireViaProject<T extends { projectId: string }>(
  actor: Actor,
  entity: T | null,
  what: string,
  level: AccessLevel,
) {
  if (!entity) throw notFound(what);
  const { access } = await requireProject(actor, entity.projectId, level).catch((err: unknown) => {
    // Hide the parent's existence behind the child's name.
    throw err instanceof AppError && err.status === 404 ? notFound(what) : err;
  });
  return { entity, access };
}

export async function requireCard(actor: Actor, cardId: string, level: AccessLevel) {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true, projectId: true, listId: true, title: true, archivedAt: true },
  });
  return requireViaProject(actor, card, 'Kartu', level);
}

export async function requireList(actor: Actor, listId: string, level: AccessLevel) {
  const list = await prisma.boardList.findUnique({
    where: { id: listId },
    select: { id: true, projectId: true, name: true, position: true, archivedAt: true },
  });
  return requireViaProject(actor, list, 'Kolom', level);
}

export async function requireLabel(actor: Actor, labelId: string, level: AccessLevel) {
  const label = await prisma.label.findUnique({ where: { id: labelId } });
  return requireViaProject(actor, label, 'Label', level);
}

export async function requireChecklistItem(actor: Actor, itemId: string, level: AccessLevel) {
  const item = await prisma.checklistItem.findUnique({
    where: { id: itemId },
    select: { id: true, cardId: true, title: true, isDone: true, card: { select: { projectId: true } } },
  });
  return requireViaProject(actor, item && { ...item, projectId: item.card.projectId }, 'Checklist', level);
}

export async function requireComment(actor: Actor, commentId: string, level: AccessLevel) {
  const comment = await prisma.comment.findFirst({
    where: { id: commentId, deletedAt: null },
    select: { id: true, cardId: true, authorId: true, card: { select: { projectId: true, title: true } } },
  });
  return requireViaProject(actor, comment && { ...comment, projectId: comment.card.projectId }, 'Komentar', level);
}

export async function requireAttachment(actor: Actor, attachmentId: string, level: AccessLevel) {
  const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, deletedAt: null } });
  return requireViaProject(actor, attachment, 'File', level);
}

/** Prisma filter selecting exactly the projects the actor may view. Mirrors `projectAccess`. */
export function visibleProjectsWhere(actor: Actor): Prisma.ProjectWhereInput {
  const inOrg: Prisma.ProjectWhereInput = { division: { orgId: actor.orgId, archivedAt: null } };
  if (isOrgAdmin(actor.orgRole)) return inOrg;

  const readable: Prisma.ProjectWhereInput[] = [
    { members: { some: { userId: actor.userId } } },
    { division: { members: { some: { userId: actor.userId, role: 'LEAD' } } } },
  ];
  if (actor.orgRole !== 'GUEST') {
    readable.push({ isPrivate: false, division: { members: { some: { userId: actor.userId } } } });
  }
  return { AND: [inOrg, { OR: readable }] };
}

export async function getDivisionRole(actor: Actor, divisionId: string, db: Tx = prisma) {
  const division = await db.division.findFirst({
    where: { id: divisionId, orgId: actor.orgId, archivedAt: null },
    select: { id: true, name: true, members: { where: { userId: actor.userId }, select: { role: true } } },
  });
  if (!division) return null;
  return { division, divisionRole: division.members[0]?.role ?? null };
}

export async function requireDivision(actor: Actor, divisionId: string, level: 'view' | 'manage') {
  const result = await getDivisionRole(actor, divisionId);
  const facts = { orgRole: actor.orgRole, divisionRole: result?.divisionRole ?? null };
  if (!result || !canViewDivision(facts)) throw notFound('Divisi');
  if (level === 'manage' && !canManageDivision(facts)) throw forbidden();
  return result;
}

export function requireOrgAdmin(actor: Actor): void {
  if (!isOrgAdmin(actor.orgRole)) throw forbidden();
}
