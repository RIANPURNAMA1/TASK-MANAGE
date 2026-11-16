import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarDays, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { MyTaskDTO } from '@nexus/shared';
import { Button, Segmented, Select } from '../../components/ui';
import { dueStatus } from '../../lib/format';
import { useUiStore } from '../../stores/ui';
import { useCardModal } from '../card/useCardModal';
import { useProjectsQuery } from '../projects/hooks';
import { CalendarWorkspace } from './CalendarWorkspace';
import { useCalendarParams } from './calendarState';
import { type CalendarScope, dayKey } from './calendarUtils';
import { useCalendarQuery } from './hooks';
import { buildIcs, downloadIcs } from './icsExport';

/**
 * Work calendar for the whole organization: cards appear from their start date through their
 * due date. Filterable by scope (my tasks / everything I can see) and project. State lives in
 * the URL so a view can be bookmarked or shared.
 */
export function CalendarPage() {
  const cal = useCalendarParams();
  const [params] = useSearchParams();
  const scope: CalendarScope = params.get('scope') === 'all' ? 'all' : 'mine';
  const projectId = params.get('project') ?? undefined;
  const hideDone = params.get('done') === '0';

  const tasksQuery = useCalendarQuery(cal.range, scope, projectId);
  const projects = useProjectsQuery();
  const { openInProject } = useCardModal();
  const openQuickTaskOn = useUiStore((s) => s.openQuickTaskOn);

  const tasks = useMemo(
    () => (tasksQuery.data ?? []).filter((t) => !(hideDone && t.completedAt)),
    [tasksQuery.data, hideDone],
  );

  const stats = useMemo(() => {
    let overdue = 0;
    let done = 0;
    for (const t of tasksQuery.data ?? []) {
      if (t.completedAt) done += 1;
      else if (dueStatus(t.dueDate, t.completedAt) === 'overdue') overdue += 1;
    }
    const total = tasksQuery.data?.length ?? 0;
    return { total, overdue, done, open: total - done };
  }, [tasksQuery.data]);

  const open = useCallback((task: MyTaskDTO) => openInProject(task.projectId, task.id), [openInProject]);

  const exportIcs = () => {
    const items = tasks.filter((t) => t.dueDate);
    if (items.length === 0) {
      toast.info('Tidak ada task di rentang ini untuk diekspor.');
      return;
    }
    downloadIcs(`kalender-${format(cal.range.from, 'yyyy-MM-dd')}.ics`, buildIcs(items, window.location.origin));
    toast.success(`${items.length} task diekspor ke file .ics.`);
  };

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="border-b border-line bg-surface px-8 pb-5 pt-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
              <CalendarDays className="h-[22px] w-[22px] text-brand" aria-hidden />
              Kalender
            </h1>
            <p className="mt-2 text-[0.875rem] text-ink-muted">
              Jadwal pekerjaan dari tanggal mulai hingga tenggat. Seret task ke tanggal lain untuk menjadwalkan ulang.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exportIcs}>
              Ekspor .ics
            </Button>
            <Button icon={<CalendarDays className="h-4 w-4" />} onClick={() => openQuickTaskOn(dayKey(cal.selected))}>
              Task baru
            </Button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Segmented
            items={[
              { value: 'mine' as const, label: 'Task saya' },
              { value: 'all' as const, label: 'Semua task' },
            ]}
            value={scope}
            onChange={(v) => cal.setParam({ scope: v === 'mine' ? null : v })}
          />
          <Select
            aria-label="Filter proyek"
            value={projectId ?? ''}
            onChange={(e) => cal.setParam({ project: e.target.value || null })}
            className="w-48"
          >
            <option value="">Semua proyek</option>
            {(projects.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[0.8125rem] text-ink-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand"
              checked={hideDone}
              onChange={(e) => cal.setParam({ done: e.target.checked ? '0' : null })}
            />
            Sembunyikan selesai
          </label>
        </div>

        {tasksQuery.data && (
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.8125rem] text-ink-muted">
            <span>
              <span className="font-semibold tabular-nums text-ink">{stats.total}</span> task bertenggat
            </span>
            <span>
              <span className="font-semibold tabular-nums text-ink">{stats.open}</span> aktif
            </span>
            <span>
              <span className="font-semibold tabular-nums text-ink">{stats.done}</span> selesai
            </span>
            {stats.overdue > 0 && (
              <span className="font-medium text-danger-ink">
                <span className="tabular-nums">{stats.overdue}</span> terlambat
              </span>
            )}
          </p>
        )}
      </header>

      <div className="flex-1 px-8 pb-10 pt-6">
        <CalendarWorkspace
          cal={cal}
          tasks={tasks}
          loading={tasksQuery.isPending}
          error={tasksQuery.isError ? tasksQuery.error : undefined}
          onRetry={() => void tasksQuery.refetch()}
          canEdit
          onOpen={open}
        />
      </div>
    </div>
  );
}
