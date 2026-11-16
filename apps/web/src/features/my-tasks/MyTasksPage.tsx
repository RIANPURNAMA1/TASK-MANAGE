import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import type { MyTaskDTO } from '@nexus/shared';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { ProjectGlyph } from '../../components/layout/ProjectSidebar';
import { api } from '../../lib/api';
import { dueStatus } from '../../lib/format';
import { qk } from '../../lib/queryKeys';
import { useCurrentUser } from '../../stores/auth';
import { CardTile } from '../board/KanbanCard';
import { useCardModal } from '../card/useCardModal';

type SectionKey = 'overdue' | 'today' | 'upcoming' | 'none' | 'done';

const SECTIONS: { key: SectionKey; title: string; dot: string; defaultOpen: boolean }[] = [
  { key: 'overdue', title: 'Terlambat', dot: 'bg-danger', defaultOpen: true },
  { key: 'today', title: 'Jatuh Tempo Hari Ini', dot: 'bg-warning', defaultOpen: true },
  { key: 'upcoming', title: 'Mendatang', dot: 'bg-brand', defaultOpen: true },
  { key: 'none', title: 'Tanpa Tenggat', dot: 'bg-ink-subtle', defaultOpen: true },
  { key: 'done', title: 'Selesai', dot: 'bg-success', defaultOpen: false },
];

function sectionOf(task: MyTaskDTO): SectionKey {
  const status = dueStatus(task.dueDate, task.completedAt);
  if (status === 'done' || task.completedAt) return 'done';
  if (status === 'overdue') return 'overdue';
  if (status === 'today') return 'today';
  if (status === 'none') return 'none';
  return 'upcoming';
}

export function MyTasksPage() {
  const user = useCurrentUser();
  const tasks = useQuery({ queryKey: qk.myTasks, queryFn: api.me.tasks });

  const grouped = useMemo(() => {
    const groups: Record<SectionKey, MyTaskDTO[]> = { overdue: [], today: [], upcoming: [], none: [], done: [] };
    for (const t of tasks.data ?? []) groups[sectionOf(t)].push(t);
    for (const list of Object.values(groups)) {
      list.sort((a, b) => (a.dueDate ?? '￿').localeCompare(b.dueDate ?? '￿'));
    }
    return groups;
  }, [tasks.data]);

  const openCount = (tasks.data ?? []).filter((t) => !t.completedAt).length;

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="border-b border-line bg-surface px-8 pb-6 pt-7">
        <h1 className="flex items-center gap-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
          <CheckCircle2 className="h-[22px] w-[22px] text-brand" aria-hidden />
          My Tasks
        </h1>
        <p className="mt-2 text-[0.875rem] text-ink-muted">
          Halo {user.name.split(' ')[0]}, Anda punya <span className="font-semibold text-ink">{openCount} task aktif</span> di
          semua divisi.
        </p>
        {tasks.data && tasks.data.length > 0 && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {SECTIONS.map(({ key, title, dot }) =>
              grouped[key].length > 0 ? (
                <a
                  key={key}
                  href={`#section-${key}`}
                  className="inline-flex h-9 items-center gap-2 rounded-xl bg-canvas-deep px-3 text-[0.875rem] font-medium text-ink-muted transition-colors hover:bg-line/70 hover:text-ink"
                >
                  <span className={clsx('h-2 w-2 rounded-full', dot)} aria-hidden />
                  {title}
                  <span className="tabular-nums text-ink-subtle">{grouped[key].length}</span>
                </a>
              ) : null,
            )}
          </div>
        )}
      </header>

      <div className="flex-1 px-8 pb-10 pt-6">
        {tasks.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-36 rounded-2xl" />
            ))}
          </div>
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : tasks.data.length === 0 ? (
          <EmptyState icon={<CheckCircle2 />} title="Belum ada task" description="Task yang ditugaskan ke Anda akan muncul di sini." />
        ) : (
          <div className="space-y-8">
            {SECTIONS.map(({ key, ...section }) => (
              <TaskSection key={key} id={`section-${key}`} {...section} tasks={grouped[key]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskSection({
  id,
  title,
  dot,
  tasks,
  defaultOpen,
}: {
  id: string;
  title: string;
  dot: string;
  tasks: MyTaskDTO[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { openInProject } = useCardModal();
  if (tasks.length === 0) return null;

  return (
    <section id={id} aria-label={title} className="scroll-mt-6">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2.5 border-b border-line px-1 text-left"
      >
        <span className={clsx('h-2 w-2 shrink-0 rounded-full', dot)} aria-hidden />
        <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>
        <span className="text-[0.9375rem] font-medium tabular-nums text-ink-subtle">{tasks.length}</span>
        <ChevronDown className={clsx('ml-auto h-4 w-4 text-ink-subtle transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tasks.map((t) => (
            <li key={t.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => openInProject(t.project.id, t.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openInProject(t.project.id, t.id);
                  }
                }}
                aria-label={`Buka kartu ${t.title}`}
                className="block h-full w-full cursor-pointer rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-brand [&>article]:h-full [&>article]:flex [&>article]:flex-col [&>article>footer]:mt-auto"
              >
                <CardTile
                  card={t}
                  context={
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ProjectGlyph color={t.project.color} className="h-3 w-3 rounded-[3px] border-2" />
                      <span className="truncate">
                        {t.project.divisionName} · {t.project.name} · {t.list.name}
                      </span>
                    </span>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
