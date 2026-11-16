import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { Eye, KanbanSquare, Lock, Plus, SlidersHorizontal, Table2, UserPlus } from 'lucide-react';
import { sortByPosition, type BoardData, type CardSummary, type ProjectDTO } from '@nexus/shared';
import { AvatarStack, Button, ErrorState, Skeleton } from '../../components/ui';
import { ProjectGlyph } from '../../components/layout/ProjectSidebar';
import { dueStatus } from '../../lib/format';
import { useCardModal } from '../card/useCardModal';
import { useChannelsQuery, useOpenProjectChannel } from '../chat/hooks';
import { useJoinProject } from '../projects/hooks';
import { FilterBar } from './FilterBar';
import { EMPTY_FILTERS, applyFilters, isFiltering, type BoardFilters } from './filters';
import { useBoardQuery, useProjectRoom } from './hooks';
import { KanbanBoard } from './KanbanBoard';
import { COLUMN_WIDTH } from './KanbanColumn';
import { TableView } from './TableView';

type View = 'board' | 'table';

export function BoardPage() {
  const { projectId = '' } = useParams();
  const board = useBoardQuery(projectId);
  useProjectRoom(projectId);

  if (board.isPending) return <BoardSkeleton />;
  if (board.isError) {
    return (
      <div className="p-8">
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      </div>
    );
  }
  return <Board data={board.data} />;
}

function Board({ data }: { data: BoardData }) {
  const { project } = data;
  const [params, setParams] = useSearchParams();
  const view: View = params.get('view') === 'table' ? 'table' : 'board';
  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { open } = useCardModal();

  const lists = useMemo(() => sortByPosition(data.lists), [data.lists]);
  const cards = useMemo(() => sortByPosition(applyFilters(data.cards, filters)), [data.cards, filters]);
  const filtering = isFiltering(filters);

  const setView = (next: View) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'table') p.set('view', 'table');
      else p.delete('view');
      return p;
    });

  return (
    <div className="flex min-h-full flex-col bg-canvas-deep/60">
      <ProjectHeader project={project} members={data.members} />

      <div className="sticky top-0 z-20 bg-canvas-deep/85 px-8 backdrop-blur">
        <div className="flex h-16 items-center gap-1 border-b border-line">
          <ViewTab active={view === 'board'} onClick={() => setView('board')} icon={<KanbanSquare />}>
            Kanban
          </ViewTab>
          <ViewTab active={view === 'table'} onClick={() => setView('table')} icon={<Table2 />}>
            Tabel
          </ViewTab>

          <div className="ml-auto flex items-center gap-4">
            <BoardSummary cards={cards} total={data.cards.length} filtering={filtering} />
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen || filtering}
              className={clsx(
                'inline-flex h-9 items-center gap-2 rounded-xl px-3 text-[0.875rem] font-medium transition-colors',
                filtersOpen || filtering ? 'bg-surface text-ink shadow-[0_1px_2px_rgba(15,23,42,0.06)]' : 'text-ink-muted hover:text-ink',
              )}
            >
              <SlidersHorizontal className="h-[18px] w-[18px]" />
              Filter
              {filtering && <span className="h-2 w-2 rounded-full bg-brand" aria-label="Filter aktif" />}
            </button>
          </div>
        </div>

        {(filtersOpen || filtering) && (
          <div className="border-b border-line py-3">
            <FilterBar value={filters} onChange={setFilters} members={data.members} labels={data.labels} />
          </div>
        )}
      </div>

      {!project.access.canEdit && (
        <div className="px-8 pt-5">
          <p className="flex items-center gap-2 rounded-xl border border-info/20 bg-info-soft px-4 py-2.5 text-info-ink">
            <Eye className="h-4 w-4 shrink-0" />
            Anda melihat proyek ini dalam mode baca. Gabung ke proyek untuk mengubah kartu.
          </p>
        </div>
      )}

      <div className="flex-1 pt-5">
        {view === 'board' ? (
          <KanbanBoard
            projectId={project.id}
            lists={lists}
            cards={cards}
            canEdit={project.access.canEdit}
            onOpenCard={open}
          />
        ) : (
          <div className="px-8 pb-10">
            <TableView lists={lists} cards={cards} onOpenCard={open} />
          </div>
        )}
      </div>
    </div>
  );
}

function ViewTab({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-[0.875rem] font-medium transition-colors [&>svg]:h-[18px] [&>svg]:w-[18px]',
        active ? 'bg-line/70 text-ink' : 'text-ink-muted hover:text-ink',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function ProjectHeader({ project, members }: { project: ProjectDTO; members: BoardData['members'] }) {
  const join = useJoinProject();
  const openChat = useOpenProjectChannel();
  const channels = useChannelsQuery();
  const unread = channels.data?.find((c) => c.project?.id === project.id)?.unreadCount ?? 0;
  const settings = (section?: string) =>
    `/projects/${project.id}/settings${section ? `?section=${section}` : ''}`;

  return (
    <header className="border-b border-line bg-surface px-8 pt-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
            <ProjectGlyph color={project.color} className="h-[22px] w-[22px] rounded-[6px] border-[3px]" />
            <span className="truncate">{project.name}</span>
          </h1>
          <nav aria-label="Breadcrumb" className="mt-2 flex items-center gap-2 pl-3 text-[0.875rem] text-ink-muted">
            <span className="mb-2 h-3 w-3 rounded-bl-md border-b-2 border-l-2 border-line-strong" aria-hidden />
            <Link to={`/divisions/${project.divisionId}`} className="inline-flex items-center gap-1.5 hover:text-ink">
              <span className="h-3 w-3 rounded-[3px] border-2 border-ink-subtle" aria-hidden />
              {project.divisionName}
            </Link>
            {project.isPrivate && (
              <>
                <span className="text-line-strong">/</span>
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="h-3.5 w-3.5" aria-hidden /> Privat
                </span>
              </>
            )}
            {project.description && (
              <>
                <span className="text-line-strong">/</span>
                <span className="max-w-[48ch] truncate">{project.description}</span>
              </>
            )}
          </nav>
        </div>
        {!project.myRole && !project.isPrivate && (
          <Button size="sm" icon={<UserPlus className="h-4 w-4" />} loading={join.isPending} onClick={() => join.mutate(project.id)}>
            Gabung proyek
          </Button>
        )}
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <nav aria-label="Bagian proyek" className="-mb-px flex items-center gap-7">
          <HeaderTab active>Tugas</HeaderTab>
          <HeaderTab onClick={() => openChat.mutate(project.id)} badge={unread}>
            Diskusi
          </HeaderTab>
          <HeaderTab to={settings('activity')}>Aktivitas</HeaderTab>
          <HeaderTab to={settings('archive')}>Arsip</HeaderTab>
          <HeaderTab to={settings()}>Pengaturan</HeaderTab>
        </nav>

        <div className="mb-3 flex items-center gap-3">
          <Link to={settings('members')} aria-label={`${members.length} anggota proyek`} title="Anggota proyek">
            <AvatarStack users={members} max={3} size="md" />
          </Link>
          {project.access.canManage && (
            <>
              <span className="h-7 w-px bg-line" aria-hidden />
              <Link
                to={settings('members')}
                aria-label="Tambah anggota"
                title="Tambah anggota"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-canvas-deep text-ink-muted transition-colors hover:bg-line hover:text-ink"
              >
                <Plus className="h-[18px] w-[18px]" />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const headerTabClass = (active: boolean) =>
  clsx(
    'relative inline-flex items-center gap-2 pb-3.5 text-[0.875rem] transition-colors',
    "after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:content-['']",
    active ? 'font-semibold text-ink after:bg-brand' : 'font-medium text-ink-muted after:bg-transparent hover:text-ink',
  );

function HeaderTab({
  children,
  active = false,
  to,
  onClick,
  badge = 0,
}: {
  children: ReactNode;
  active?: boolean;
  to?: string;
  onClick?: () => void;
  badge?: number;
}) {
  const content = (
    <>
      {children}
      {badge > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </>
  );
  if (to) {
    return (
      <Link to={to} className={headerTabClass(active)}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className={headerTabClass(active)}>
      {content}
    </button>
  );
}

function BoardSummary({ cards, total, filtering }: { cards: CardSummary[]; total: number; filtering: boolean }) {
  const overdue = cards.filter((c) => dueStatus(c.dueDate, c.completedAt) === 'overdue').length;
  return (
    <p className="hidden whitespace-nowrap text-[0.8125rem] font-semibold text-ink-subtle md:block">
      {filtering ? `${cards.length} dari ${total} kartu` : `${total} kartu`}
      {overdue > 0 && <span className="text-danger-ink"> · {overdue} terlambat</span>}
    </p>
  );
}

function BoardSkeleton() {
  return (
    <div className="min-h-full bg-canvas-deep/60">
      <div className="space-y-4 border-b border-line bg-surface px-8 pb-4 pt-7">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-5 w-96" />
      </div>
      <div className="flex gap-5 px-8 pt-24">
        {[3, 2, 1].map((n, i) => (
          <div key={i} className={`${COLUMN_WIDTH} shrink-0 space-y-3`}>
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-11 w-full rounded-2xl" />
            {Array.from({ length: n }, (_, j) => (
              <Skeleton key={j} className="h-40 w-full rounded-2xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
