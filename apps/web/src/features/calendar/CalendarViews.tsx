import clsx from 'clsx';
import { differenceInCalendarDays, format, isToday, isTomorrow, isWeekend } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { CalendarX2 } from 'lucide-react';
import type { MyTaskDTO } from '@nexus/shared';
import { EmptyState } from '../../components/ui';
import { ProjectGlyph } from '../../components/layout/ProjectSidebar';
import { readableTextOn } from '../../lib/color';
import { dueStatus } from '../../lib/format';
import { DayCell } from './DayCell';
import { TaskRow } from './TaskRow';
import { dayKey, daysIn, parseDayKey, spanOf } from './calendarUtils';

interface GridProps {
  range: { from: Date; to: Date };
  anchor: Date;
  byDay: Map<string, MyTaskDTO[]>;
  selected: Date;
  readOnly?: boolean;
  onSelect: (date: Date) => void;
  onOpen: (task: MyTaskDTO) => void;
  onCreate: (date: Date) => void;
  onDropCard: (cardId: string, from: Date, to: Date) => void;
}

const WEEKDAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/** Classic month grid: whole weeks, Monday first. */
export function MonthView({ range, anchor, byDay, selected, readOnly, onSelect, onOpen, onCreate, onDropCard }: GridProps) {
  const days = daysIn(range.from, range.to);
  return (
    <div className="overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle">
      <div className="grid grid-cols-7 border-b border-line-subtle bg-canvas/60">
        {WEEKDAYS.map((d) => (
          <div key={d} className="px-2 py-2 text-center text-caption font-semibold uppercase tracking-[0.06em] text-ink-subtle">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 [&>div:nth-child(7n)]:border-r-0">
        {days.map((date) => (
          <DayCell
            key={dayKey(date)}
            date={date}
            anchor={anchor}
            tasks={byDay.get(dayKey(date)) ?? []}
            selected={dayKey(date) === dayKey(selected)}
            maxChips={3}
            readOnly={readOnly}
            onSelect={onSelect}
            onOpen={onOpen}
            onCreate={onCreate}
            onDropCard={onDropCard}
          />
        ))}
      </div>
    </div>
  );
}

/** Seven tall day columns with times, for planning a single week. */
export function WeekView({ range, anchor, byDay, selected, readOnly, onSelect, onOpen, onCreate, onDropCard }: GridProps) {
  const days = daysIn(range.from, range.to);
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle">
      <div className="grid min-w-[840px] grid-cols-7 [&>div:nth-child(7n)]:border-r-0">
        {days.map((date) => (
          <DayCell
            key={dayKey(date)}
            date={date}
            anchor={anchor}
            tasks={byDay.get(dayKey(date)) ?? []}
            selected={dayKey(date) === dayKey(selected)}
            maxChips={Number.POSITIVE_INFINITY}
            weekday
            tall
            readOnly={readOnly}
            onSelect={onSelect}
            onOpen={onOpen}
            onCreate={onCreate}
            onDropCard={onDropCard}
          />
        ))}
      </div>
    </div>
  );
}

function dayHeading(date: Date): string {
  const base = format(date, 'EEEE, d MMMM', { locale: localeId });
  if (isToday(date)) return `Hari ini · ${base}`;
  if (isTomorrow(date)) return `Besok · ${base}`;
  return base;
}

/** Chronological list of the month's tasks, grouped per day (no empty days). */
export function AgendaView({ byDay, onOpen }: { byDay: Map<string, MyTaskDTO[]>; onOpen: (task: MyTaskDTO) => void }) {
  const keys = [...byDay.keys()].sort();
  if (keys.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX2 />}
        title="Tidak ada task bertenggat di bulan ini"
        description="Atur tenggat pada sebuah kartu, atau seret kartu ke tanggal di tampilan Bulan."
      />
    );
  }
  return (
    <div className="space-y-5">
      {keys.map((key) => {
        const date = parseDayKey(key);
        const tasks = byDay.get(key)!;
        return (
          <section key={key} aria-label={dayHeading(date)}>
            <h3 className="flex items-center gap-2 border-b border-line px-1 pb-2 text-[0.9375rem] font-semibold capitalize text-ink">
              {dayHeading(date)}
              <span className="text-[0.875rem] font-medium tabular-nums text-ink-subtle">{tasks.length}</span>
            </h3>
            <div className="mt-1 rounded-2xl bg-surface p-1 ring-1 ring-inset ring-line-subtle">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} onOpen={onOpen} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const TIMELINE_DAY_W = 34;
const TIMELINE_LABEL_W = 260;
const TIMELINE_MAX_ROWS = 200;

/**
 * Gantt-style month: one row per task, a bar from its start to its due date (a single-day bar
 * when it has no start). Read-only; click a bar or title to open the card.
 */
export function TimelineView({
  range,
  tasks,
  onOpen,
}: {
  range: { from: Date; to: Date };
  tasks: MyTaskDTO[];
  onOpen: (task: MyTaskDTO) => void;
}) {
  const days = daysIn(range.from, range.to);
  const last = days.length - 1;
  const rows = tasks
    .map((task) => ({ task, span: spanOf(task) }))
    .filter((r): r is { task: MyTaskDTO; span: NonNullable<ReturnType<typeof spanOf>> } => r.span !== null)
    .sort((a, b) => a.span.first.getTime() - b.span.first.getTime() || a.span.last.getTime() - b.span.last.getTime())
    .slice(0, TIMELINE_MAX_ROWS);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarX2 />}
        title="Belum ada task di bulan ini"
        description="Isi tanggal mulai dan tenggat pada kartu agar tampil sebagai batang di timeline."
      />
    );
  }

  const template = `${TIMELINE_LABEL_W}px repeat(${days.length}, ${TIMELINE_DAY_W}px)`;
  const todayIdx = days.findIndex((d) => isToday(d));
  const gridLines = {
    gridColumn: '2 / -1',
    gridRow: 1,
    backgroundImage: 'linear-gradient(to right, rgb(var(--c-line-subtle)) 1px, transparent 1px)',
    backgroundSize: `${TIMELINE_DAY_W}px 100%`,
  } as const;

  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle">
      <div className="relative min-w-max">
        {todayIdx >= 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 top-0 z-[1] bg-brand/[0.06]"
            style={{ left: TIMELINE_LABEL_W + todayIdx * TIMELINE_DAY_W, width: TIMELINE_DAY_W }}
          />
        )}

        <div className="grid border-b border-line-subtle bg-canvas/60" style={{ gridTemplateColumns: template }}>
          <div className="sticky left-0 z-10 bg-canvas px-4 py-2 text-caption font-semibold uppercase tracking-[0.06em] text-ink-subtle">
            Task
          </div>
          {days.map((d) => (
            <div
              key={dayKey(d)}
              className={clsx(
                'py-1.5 text-center leading-tight',
                isWeekend(d) && 'bg-canvas-deep/60',
                isToday(d) ? 'font-semibold text-brand' : 'text-ink-subtle',
              )}
            >
              <div className="text-[10px] uppercase">{format(d, 'EEEEE', { locale: localeId })}</div>
              <div className="text-[0.75rem] tabular-nums">{format(d, 'd')}</div>
            </div>
          ))}
        </div>

        {rows.map(({ task, span }) => {
          const a = Math.max(0, differenceInCalendarDays(span.first, range.from));
          const b = Math.min(last, differenceInCalendarDays(span.last, range.from));
          const startsBefore = span.first < range.from;
          const endsAfter = span.last >= range.to;
          const status = dueStatus(task.dueDate, task.completedAt);
          const done = Boolean(task.completedAt);
          const wide = b - a + 1 >= 3;
          return (
            <div
              key={task.id}
              className="grid items-center border-b border-line-subtle last:border-b-0"
              style={{ gridTemplateColumns: template }}
            >
              <button
                type="button"
                onClick={() => onOpen(task)}
                className="sticky left-0 z-10 flex min-w-0 items-center gap-2 bg-surface px-4 py-2 text-left hover:bg-canvas-deep"
              >
                <ProjectGlyph color={task.project.color} />
                <span
                  className={clsx(
                    'truncate text-[0.8125rem]',
                    done ? 'text-ink-subtle line-through' : status === 'overdue' ? 'font-medium text-danger-ink' : 'text-ink',
                  )}
                >
                  {task.title}
                </span>
              </button>
              <div aria-hidden style={gridLines} />
              <button
                type="button"
                onClick={() => onOpen(task)}
                title={`${task.title}
${task.startDate ? `${format(span.first, 'd MMM', { locale: localeId })} – ` : ''}${format(span.last, 'd MMM yyyy', { locale: localeId })}`}
                className={clsx(
                  'z-[2] mx-px flex h-6 min-w-0 items-center overflow-hidden px-2 text-left text-[0.6875rem] font-medium transition-opacity hover:opacity-90',
                  startsBefore ? 'rounded-l-none' : 'rounded-l-md',
                  endsAfter ? 'rounded-r-none' : 'rounded-r-md',
                  done && 'opacity-50',
                  status === 'overdue' && 'ring-2 ring-danger',
                )}
                style={{
                  gridColumn: `${a + 2} / ${b + 3}`,
                  gridRow: 1,
                  backgroundColor: task.project.color,
                  color: readableTextOn(task.project.color),
                }}
              >
                {wide && <span className="truncate">{task.title}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
