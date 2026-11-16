import { prisma } from '@nexus/db';
import type { MyTaskDTO } from '@nexus/shared';
import type { Actor } from '../access/actor';
import { visibleProjectsWhere } from '../access/access.service';
import { cardSummaryInclude, toCardSummary } from './board.mapper';

/**
 * Every card assigned to the actor across all divisions (FR-15). Completed cards are
 * limited to the last 14 days so the page stays focused on current work.
 */
export async function listMyTasks(actor: Actor): Promise<MyTaskDTO[]> {
  const recentlyDone = new Date(Date.now() - 14 * 24 * 3600 * 1000);

  const cards = await prisma.card.findMany({
    where: {
      archivedAt: null,
      assignees: { some: { userId: actor.userId } },
      list: { archivedAt: null },
      project: { AND: [visibleProjectsWhere(actor), { archivedAt: null }] },
      OR: [{ completedAt: null }, { completedAt: { gte: recentlyDone } }],
    },
    include: {
      ...cardSummaryInclude,
      list: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true, division: { select: { name: true } } } },
    },
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: 500,
  });

  return cards.map((card) => ({
    ...toCardSummary(card),
    list: card.list,
    project: {
      id: card.project.id,
      name: card.project.name,
      color: card.project.color,
      divisionName: card.project.division.name,
    },
  }));
}
