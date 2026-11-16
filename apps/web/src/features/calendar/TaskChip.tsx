import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import type { MyTaskDTO } from '@nexus/shared';
import { dueStatus } from '../../lib/format';
import { PriorityIcon } from '../board/CardBits';
import { dayKey, partOn } from './calendarUtils';

/** MIME types used for drag & drop so unrelated drags (files, text) are ignored by day cells. */
export const CARD_DRAG_TYPE = 'application/x-mendunia-card';
/** The day the chip was picked up from; a range moves by (drop day − pick-up day). */
export const CARD_FROM_TYPE = 'application/x-mendunia-card-from';

/**
 * One task on one day of the calendar. Left bar = project color; red title when overdue;
 * struck through when done. A card with a start date is drawn as a joined bar across its days.
 * Draggable to another day to reschedule (the whole range moves together).
 */
export function TaskChip({
  task,
  day,
  showTime,
  readOnly,
  onOpen,
}: {
  task: MyTaskDTO;
  day: Date;
  showTime?: boolean;
  /** Viewers can't reschedule, so the chip isn't draggable. */
  readOnly?: boolean;
  onOpen: (task: MyTaskDTO) => void;
}) {
  const status = dueStatus(task.dueDate, task.completedAt);
  const done = status === 'done' || Boolean(task.completedAt);
  const { isStart, isEnd, isRange } = partOn(task, day);
  return (
    <button
      type="button"
      draggable={!readOnly}
      onDragStart={(e) => {
        e.dataTransfer.setData(CARD_DRAG_TYPE, task.id);
        e.dataTransfer.setData(CARD_FROM_TYPE, dayKey(day));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(task);
      }}
      title={`${task.title} — ${task.project.name}`}
      style={{ borderLeftColor: task.project.color }}
      className={clsx(
        'flex w-full min-w-0 items-center gap-1.5 py-[3px] text-left text-[0.75rem] leading-tight transition-colors',
        isRange ? 'bg-brand-subtle hover:bg-brand-border/60' : 'bg-canvas-deep/70 hover:bg-canvas-deep',
        // Bridge the cell padding so a range reads as one continuous bar across days.
        isStart ? 'rounded-l-md border-l-[3px] pl-1.5' : '-ml-1.5 rounded-l-none pl-3',
        isEnd ? 'rounded-r-md pr-1.5' : '-mr-1.5 rounded-r-none pr-3',
        done ? 'text-ink-subtle line-through' : status === 'overdue' ? 'font-medium text-danger-ink' : 'text-ink',
      )}
    >
      {showTime && isEnd && task.dueDate && (
        <span className="shrink-0 tabular-nums text-ink-subtle">{format(parseISO(task.dueDate), 'HH:mm')}</span>
      )}
      <span className={clsx('min-w-0 flex-1 truncate', !isStart && 'opacity-70')}>{task.title}</span>
      {isEnd && <PriorityIcon priority={task.priority} />}
    </button>
  );
}
