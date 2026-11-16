import { useCallback, useMemo, type DragEvent } from 'react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { MyTaskDTO } from '@nexus/shared';
import { Button, ErrorState, Segmented, Skeleton } from '../../components/ui';
import { ProjectGlyph } from '../../components/layout/ProjectSidebar';
import { useUiStore } from '../../stores/ui';
import { AgendaView, MonthView, TimelineView, WeekView } from './CalendarViews';
import { DayPanel } from './DayPanel';
import type { CalendarParams } from './calendarState';
import { type CalendarView, dayKey, groupByDay, periodLabel, shiftedDates } from './calendarUtils';
import { useRescheduleCard } from './hooks';
import { CARD_DRAG_TYPE } from './TaskChip';

const VIEW_LABEL: Record<CalendarView, string> = { month: 'Bulan', week: 'Minggu', agenda: 'Agenda', timeline: 'Timeline' };

/** Default due time when a card is scheduled by dropping it on a day (end of the working day). */
const DEFAULT_HOUR = 17;

/**
 * The calendar itself: navigation, view switch, grid/agenda/timeline and the selected-day panel.
 * Shared by the Kalender page (tasks from the whole organization) and the project board's
 * Kalender tab (cards of one project). The parent owns the data and the URL state (`cal`).
 */
export function CalendarWorkspace({
  cal,
  tasks,
  unscheduled = [],
  loading,
  error,
  onRetry,
  canEdit,
  views = ['month', 'week', 'agenda', 'timeline'],
  onOpen,
}: {
  cal: CalendarParams;
  /** Cards that have a due date (already filtered by the parent). */
  tasks: MyTaskDTO[];
  /** Cards without a due date; shown in a tray and schedulable by dragging them onto a day. */
  unscheduled?: MyTaskDTO[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  canEdit: boolean;
  views?: CalendarView[];
  onOpen: (task: MyTaskDTO) => void;
}) {
  const { view, anchor, selected, range } = cal;
  const reschedule = useRescheduleCard();
  const openQuickTaskOn = useUiStore((s) => s.openQuickTaskOn);
  const byDay = useMemo(() => groupByDay(tasks), [tasks]);

  const create = useCallback((date: Date) => openQuickTaskOn(dayKey(date)), [openQuickTaskOn]);

  const onDropCard = useCallback(
    (cardId: string, from: Date, date: Date) => {
      const task = tasks.find((t) => t.id === cardId) ?? unscheduled.find((t) => t.id === cardId);
      if (!task) return;
      const where = format(date, 'd MMMM', { locale: localeId });
      cal.select(date);

      if (!task.dueDate) {
        // From the "Belum dijadwalkan" tray: becomes due on the dropped day.
        const dueDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), DEFAULT_HOUR).toISOString();
        reschedule.mutate({ cardId, dueDate, startDate: null }, { onSuccess: () => toast.success(`Dijadwalkan pada ${where}.`) });
        return;
      }
      const next = shiftedDates(task, from, date);
      if (!next) return;
      reschedule.mutate(
        { cardId, ...next },
        {
          onSuccess: () =>
            toast.success(`${task.startDate ? 'Jadwal' : 'Tenggat'} dipindah ke ${where}${task.startDate ? ' (seluruh rentang bergeser)' : ''}.`),
        },
      );
    },
    [tasks, unscheduled, reschedule, cal],
  );

  const gridProps = {
    range,
    anchor,
    byDay,
    selected,
    readOnly: !canEdit,
    onSelect: cal.select,
    onOpen,
    onCreate: create,
    onDropCard,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="icon" aria-label="Sebelumnya" onClick={() => cal.go(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon" aria-label="Berikutnya" onClick={() => cal.go(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" onClick={cal.goToday} disabled={cal.showingToday}>
            Hari ini
          </Button>
        </div>
        <h2 className="min-w-[150px] text-[1.125rem] font-semibold capitalize text-ink">{periodLabel(view, anchor, range)}</h2>
        <div className="ml-auto">
          <Segmented items={views.map((v) => ({ value: v, label: VIEW_LABEL[v] }))} value={view} onChange={cal.setView} />
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[640px] rounded-2xl" />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : view === 'agenda' ? (
        <AgendaView byDay={byDay} onOpen={onOpen} />
      ) : view === 'timeline' ? (
        <TimelineView range={range} tasks={tasks} onOpen={onOpen} />
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          {view === 'month' ? <MonthView {...gridProps} /> : <WeekView {...gridProps} />}
          <div className="space-y-5 xl:sticky xl:top-24">
            <DayPanel
              date={selected}
              tasks={byDay.get(dayKey(selected)) ?? []}
              onOpen={onOpen}
              onCreate={canEdit ? create : undefined}
            />
            {unscheduled.length > 0 && <UnscheduledTray tasks={unscheduled} canEdit={canEdit} onOpen={onOpen} />}
          </div>
        </div>
      )}
    </div>
  );
}

/** Cards with no due date. Drag one onto a day to schedule it. */
function UnscheduledTray({ tasks, canEdit, onOpen }: { tasks: MyTaskDTO[]; canEdit: boolean; onOpen: (task: MyTaskDTO) => void }) {
  const onDragStart = (e: DragEvent, task: MyTaskDTO) => {
    e.dataTransfer.setData(CARD_DRAG_TYPE, task.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  return (
    <section className="rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle">
      <header className="flex items-center gap-2 border-b border-line-subtle px-5 py-3.5">
        <CalendarClock className="h-4 w-4 text-ink-subtle" aria-hidden />
        <h3 className="text-[0.9375rem] font-semibold text-ink">Belum dijadwalkan</h3>
        <span className="text-[0.875rem] font-medium tabular-nums text-ink-subtle">{tasks.length}</span>
      </header>
      {canEdit && <p className="px-5 pt-3 text-caption text-ink-subtle">Seret kartu ke tanggal di kalender untuk memberinya tenggat.</p>}
      <ul className="max-h-72 overflow-y-auto p-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              draggable={canEdit}
              onDragStart={(e) => onDragStart(e, task)}
              onClick={() => onOpen(task)}
              title={task.title}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-canvas-deep"
            >
              <ProjectGlyph color={task.project.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium text-ink">{task.title}</span>
                <span className="block truncate text-caption text-ink-subtle">{task.list.name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

