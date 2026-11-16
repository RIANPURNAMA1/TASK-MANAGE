import type { Prisma } from '@nexus/db';
import type { ProjectDTO } from '@nexus/shared';
import type { Actor } from '../access/actor';
import { projectAccess } from '../access/policy';

/** Everything needed to build a ProjectDTO (including the actor's access) in one query. */
export function projectInclude(actor: Actor) {
  return {
    division: {
      select: { name: true, members: { where: { userId: actor.userId }, select: { role: true } } },
    },
    members: { where: { userId: actor.userId }, select: { role: true } },
    mutes: { where: { userId: actor.userId }, select: { userId: true } },
    _count: {
      select: {
        members: true,
        cards: { where: { archivedAt: null, completedAt: null, list: { archivedAt: null } } },
      },
    },
  } satisfies Prisma.ProjectInclude;
}

export type ProjectRow = Prisma.ProjectGetPayload<{ include: ReturnType<typeof projectInclude> }>;

export function toProjectDTO(actor: Actor, row: ProjectRow): ProjectDTO {
  const myRole = row.members[0]?.role ?? null;
  return {
    id: row.id,
    divisionId: row.divisionId,
    divisionName: row.division.name,
    name: row.name,
    description: row.description,
    color: row.color,
    isPrivate: row.isPrivate,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    memberCount: row._count.members,
    openCardCount: row._count.cards,
    myRole,
    isMuted: row.mutes.length > 0,
    access: projectAccess({
      orgRole: actor.orgRole,
      divisionRole: row.division.members[0]?.role ?? null,
      projectRole: myRole,
      isPrivate: row.isPrivate,
      isArchived: row.archivedAt !== null,
    }),
  };
}
