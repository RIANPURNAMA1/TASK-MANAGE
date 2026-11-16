import { format, isToday } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { Plus } from 'lucide-react';
import type { MyTaskDTO } from '@nexus/shared';
import { Button } from '../../components/ui';
import { TaskRow } from './TaskRow';

/** Side panel: everything due on the selected day, with a shortcut to add a task. */
export function DayPanel({
  date,
  tasks,
  onOpen,
  onCreate,
}: {
  date: Date;
  tasks: MyTaskDTO[];
  onOpen: (task: MyTaskDTO) => void;
  /** Omitted for read-only viewers: hides the "+ Task" button. */
  onCreate?: (date: Date) => void;
}) {
  return (
    <aside className="rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle">
      <header className="flex items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
        <div className="min-w-0">
          <p className="text-caption font-semibold uppercase tracking-[0.06em] text-ink-subtle">
            {isToday(date) ? 'Hari ini' : format(date, 'EEEE', { locale: localeId })}
          </p>
          <h2 className="mt-0.5 text-[1.125rem] font-semibold leading-tight text-ink">
            {format(date, 'd MMMM yyyy', { locale: localeId })}
          </h2>
          <p className="mt-1 text-caption text-ink-subtle">{tasks.length === 0 ? 'Tidak ada task' : `${tasks.length} task bertenggat`}</p>
        </div>
        {onCreate && (
          <Button size="sm" variant="subtle" icon={<Plus className="h-4 w-4" />} onClick={() => onCreate(date)}>
            Task
          </Button>
        )}
      </header>
      <div className="max-h-[60vh] overflow-y-auto p-2">
        {tasks.length === 0 ? (
          <p className="px-3 py-8 text-center text-[0.875rem] text-ink-subtle">
            {onCreate ? (
              <>
                Hari yang lega. Klik <span className="font-semibold text-ink-muted">+ Task</span> untuk menjadwalkan sesuatu.
              </>
            ) : (
              'Tidak ada task pada hari ini.'
            )}
          </p>
        ) : (
          tasks.map((task) => <TaskRow key={task.id} task={task} onOpen={onOpen} />)
        )}
      </div>
    </aside>
  );
}
