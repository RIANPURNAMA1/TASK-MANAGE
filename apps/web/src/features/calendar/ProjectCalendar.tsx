import { useMemo } from 'react';
import type { CardSummary, ListDTO, MyTaskDTO, ProjectDTO } from '@nexus/shared';
import { CalendarWorkspace } from './CalendarWorkspace';
import { BOARD_CALENDAR_PARAMS, useCalendarParams } from './calendarState';

/**
 * Calendar tab of a project board. It reads the cards already loaded for the board (so the board
 * filters apply and realtime updates appear instantly) and needs no request of its own.
 */
export function ProjectCalendar({
  project,
  lists,
  cards,
  onOpenCard,
}: {
  project: ProjectDTO;
  lists: ListDTO[];
  cards: CardSummary[];
  onOpenCard: (id: string) => void;
}) {
  const cal = useCalendarParams(BOARD_CALENDAR_PARAMS);

  const { scheduled, unscheduled } = useMemo(() => {
    const listName = new Map(lists.map((l) => [l.id, l.name]));
    const projectRef = { id: project.id, name: project.name, color: project.color, divisionName: project.divisionName };
    const scheduled: MyTaskDTO[] = [];
    const unscheduled: MyTaskDTO[] = [];
    for (const card of cards) {
      const task: MyTaskDTO = { ...card, project: projectRef, list: { id: card.listId, name: listName.get(card.listId) ?? '' } };
      // Finished cards without a due date aren't "waiting to be scheduled".
      if (card.dueDate) scheduled.push(task);
      else if (!card.completedAt) unscheduled.push(task);
    }
    return { scheduled, unscheduled };
  }, [cards, lists, project]);

  return (
    <div className="px-8 pb-10">
      <CalendarWorkspace
        cal={cal}
        tasks={scheduled}
        unscheduled={unscheduled}
        canEdit={project.access.canEdit}
        views={['month', 'week', 'timeline', 'agenda']}
        onOpen={(task) => onOpenCard(task.id)}
      />
    </div>
  );
}
