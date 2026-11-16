import { useState, type DragEvent } from 'react';
import clsx from 'clsx';
import { format, isSameMonth, isToday } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import type { MyTaskDTO } from '@nexus/shared';
import { CARD_DRAG_TYPE, CARD_FROM_TYPE, TaskChip } from './TaskChip';
import { parseDayKey } from './calendarUtils';

/**
 * One day in the month grid or the week view. Accepts dropped cards (reschedule), shows up to
 * `maxChips` tasks plus a "+N lagi" link, and a hover "+" to create a task due that day.
 */
export function DayCell({
  date,
  anchor,
  tasks,
  selected,
  maxChips,
  weekday,
  tall,
  readOnly,
  onSelect,
  onOpen,
  onCreate,
  onDropCard,
}: {
  date: Date;
  /** Month being viewed; days outside it are dimmed. */
  anchor: Date;
  tasks: MyTaskDTO[];
  selected: boolean;
  maxChips: number;
  /** Week view prints the weekday name in each column header. */
  weekday?: boolean;
  tall?: boolean;
  readOnly?: boolean;
  onSelect: (date: Date) => void;
  onOpen: (task: MyTaskDTO) => void;
  onCreate: (date: Date) => void;
  onDropCard: (cardId: string, from: Date, to: Date) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const today = isToday(date);
  const outside = !weekday && !isSameMonth(date, anchor);
  const shown = tasks.slice(0, maxChips);
  const hidden = tasks.length - shown.length;

  const onDragOver = (e: DragEvent) => {
    if (readOnly || !e.dataTransfer.types.includes(CARD_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };
  const onDrop = (e: DragEvent) => {
    setDragOver(false);
    const cardId = e.dataTransfer.getData(CARD_DRAG_TYPE);
    const fromKey = e.dataTransfer.getData(CARD_FROM_TYPE);
    if (readOnly || !cardId) return;
    e.preventDefault();
    onDropCard(cardId, fromKey ? parseDayKey(fromKey) : date, date);
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => onSelect(date)}
      className={clsx(
        'group relative flex cursor-pointer flex-col gap-1 border-b border-r border-line-subtle p-1.5 transition-colors',
        tall ? 'min-h-[360px]' : 'min-h-[124px]',
        selected ? 'bg-brand-soft' : outside ? 'bg-canvas/60' : 'bg-surface hover:bg-canvas/70',
        dragOver && 'bg-brand-subtle ring-2 ring-inset ring-brand',
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={clsx(
            'inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[0.75rem] tabular-nums',
            today ? 'bg-brand font-semibold text-white' : outside ? 'text-ink-subtle' : 'font-medium text-ink-muted',
          )}
        >
          {weekday ? `${format(date, 'EEE', { locale: localeId })} ${format(date, 'd')}` : format(date, 'd')}
        </span>
        {!readOnly && (
          <button
            type="button"
            aria-label={`Tambah task pada ${format(date, 'd MMMM', { locale: localeId })}`}
            onClick={(e) => {
              e.stopPropagation();
              onCreate(date);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-ink-subtle opacity-0 transition-opacity hover:bg-canvas-deep hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        {shown.map((task) => (
          <TaskChip key={task.id} task={task} day={date} showTime={weekday} readOnly={readOnly} onOpen={onOpen} />
        ))}
        {hidden > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(date);
            }}
            className="rounded-md px-1.5 py-0.5 text-left text-[0.75rem] font-medium text-ink-subtle hover:bg-canvas-deep hover:text-ink"
          >
            +{hidden} lagi
          </button>
        )}
      </div>
    </div>
  );
}
