import { prisma } from '@nexus/db';
import type { MyTaskDTO } from '@nexus/shared';
import type { z } from 'zod';
import type { calendarQuerySchema } from '@nexus/shared';
import type { Actor } from '../access/actor';
import { visibleProjectsWhere } from '../access/access.service';
import { cardSummaryInclude, toCardSummary } from './board.mapper';

type CalendarQuery = z.output<typeof calendarQuerySchema>;

/**
 * Cards with a due date inside [from, to], for the calendar page. `mine` limits it to cards
 * assigned to the actor; `all` returns everything in projects the actor can see (the same
 * visibility rule as the board and My Tasks, so nothing leaks across divisions).
 */
export async function listCalendar(actor: Actor, query: CalendarQuery): Promise<MyTaskDTO[]> {
  const cards = await prisma.card.findMany({
    where: {
      archivedAt: null,
      // A card is on the calendar from its start (or due date, if none) through its due date,
      // so anything whose span overlaps the window is returned.
      dueDate: { gte: new Date(query.from) },
      OR: [{ startDate: null, dueDate: { lt: new Date(query.to) } }, { startDate: { lt: new Date(query.to) } }],
      ...(query.scope === 'mine' ? { assignees: { some: { userId: actor.userId } } } : {}),
      list: { archivedAt: null },
      project: {
        AND: [visibleProjectsWhere(actor), { archivedAt: null }, ...(query.projectId ? [{ id: query.projectId }] : [])],
      },
    },
    include: {
      ...cardSummaryInclude,
      list: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true, division: { select: { name: true } } } },
    },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    take: 1000,
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
