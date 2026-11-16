import { useState } from 'react';
import { FolderKanban } from 'lucide-react';
import { EmptyState, ErrorState, Segmented, Skeleton } from '../../components/ui';
import { useProjectsQuery } from './hooks';
import { ProjectGrid } from './ProjectGrid';

/** All projects the user can see, across divisions (rail "Board" entry). */
export function ProjectsIndexPage() {
  const [scope, setScope] = useState<'active' | 'archived'>('active');
  const projects = useProjectsQuery(scope === 'archived' ? { archived: true } : {});

  return (
    <div className="flex min-h-full flex-col bg-canvas-deep/60">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line bg-surface px-8 pb-6 pt-7">
        <div>
          <h1 className="flex items-center gap-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
            <FolderKanban className="h-[22px] w-[22px] text-brand" aria-hidden />
            Semua Board
          </h1>
          <p className="mt-2 text-[0.875rem] text-ink-muted">Proyek yang bisa Anda akses di seluruh divisi.</p>
        </div>
        <Segmented
          value={scope}
          onChange={setScope}
          items={[
            { value: 'active', label: 'Aktif' },
            { value: 'archived', label: 'Arsip' },
          ]}
        />
      </header>

      <div className="flex-1 px-8 py-6">
        {projects.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : projects.isError ? (
          <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
        ) : projects.data.length === 0 ? (
          <div className="rounded-2xl bg-surface py-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <EmptyState icon={<FolderKanban />} title="Belum ada proyek" description="Proyek yang Anda ikuti akan muncul di sini." />
          </div>
        ) : (
          <ProjectGrid projects={projects.data} showDivision />
        )}
      </div>
    </div>
  );
}
