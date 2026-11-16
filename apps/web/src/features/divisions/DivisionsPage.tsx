import { useState, type ReactNode } from 'react';
import { NavLink, Navigate, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { Archive, Building2, FolderKanban, FolderPlus, Pencil, Plus, Users } from 'lucide-react';
import { isOrgAdmin, type DivisionDTO } from '@nexus/shared';
import { SubNavLayout } from '../../components/layout/AppShell';
import { Button, ConfirmDialog, EmptyState, ErrorState, Skeleton } from '../../components/ui';
import { useCurrentUser } from '../../stores/auth';
import { useProjectsQuery } from '../projects/hooks';
import { CreateProjectModal } from '../projects/ProjectFormModal';
import { ProjectGrid } from '../projects/ProjectGrid';
import { DivisionFormModal } from './DivisionFormModal';
import { DivisionMembers } from './DivisionMembers';
import { useDivisionMutations, useDivisionsQuery } from './hooks';

export function DivisionsPage() {
  const { divisionId } = useParams();
  const user = useCurrentUser();
  const divisions = useDivisionsQuery();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  if (divisions.isPending) return <Skeleton className="m-8 h-64 rounded-2xl" />;
  if (divisions.isError) return <div className="p-6"><ErrorState error={divisions.error} onRetry={() => void divisions.refetch()} /></div>;

  const list = divisions.data;
  const selected = list.find((d) => d.id === divisionId);
  if (!divisionId && list[0]) return <Navigate to={`/divisions/${list[0].id}`} replace />;

  const nav = (
    <nav aria-label="Divisi" className="px-3 pb-4 pt-5">
      <div className="flex items-center justify-between px-3 pb-2">
        <h2 className="text-caption font-bold uppercase tracking-[0.08em] text-ink-subtle">Divisi</h2>
        {isOrgAdmin(user.orgRole) && (
          <button
            type="button"
            aria-label="Divisi baru"
            title="Divisi baru"
            onClick={() => setCreating(true)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-canvas-deep hover:text-ink"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <ul className="space-y-0.5">
        {list.map((d) => (
          <li key={d.id}>
            <NavLink
              to={`/divisions/${d.id}`}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-[0.875rem] transition-colors',
                  isActive ? 'bg-canvas-deep font-bold text-ink' : 'font-medium text-ink-muted hover:bg-canvas hover:text-ink',
                )
              }
            >
              <DivisionGlyph color={d.color} />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              <span className="text-caption font-semibold tabular-nums text-ink-subtle" title={`${d.projectCount} proyek`}>
                {d.projectCount}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );

  return (
    <SubNavLayout nav={nav}>
      <div className="flex min-h-full flex-col bg-canvas-deep/60">
        {selected ? (
          <DivisionDetail key={selected.id} division={selected} />
        ) : (
          <div className="p-8">
          <EmptyState
            icon={<Building2 />}
            title={list.length ? 'Divisi tidak ditemukan' : 'Belum ada divisi'}
            description={
              isOrgAdmin(user.orgRole)
                ? 'Buat divisi pertama untuk mulai mengelompokkan proyek.'
                : 'Anda belum menjadi anggota divisi mana pun. Hubungi admin.'
            }
            action={isOrgAdmin(user.orgRole) && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>Divisi baru</Button>}
          />
          </div>
        )}
      </div>
      {creating && (
        <DivisionFormModal open onClose={() => setCreating(false)} onSaved={(d) => navigate(`/divisions/${d.id}`)} />
      )}
    </SubNavLayout>
  );
}

function DivisionDetail({ division }: { division: DivisionDTO }) {
  const user = useCurrentUser();
  const [tab, setTab] = useState<'projects' | 'members'>('projects');
  const [creatingProject, setCreatingProject] = useState(false);
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { archive } = useDivisionMutations();
  const navigate = useNavigate();
  const projects = useProjectsQuery({ divisionId: division.id });

  return (
    <>
      <header className="border-b border-line bg-surface px-8 pt-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
              <DivisionGlyph color={division.color} large />
              <span className="truncate">{division.name}</span>
            </h1>
            <p className="mt-2 max-w-[70ch] text-[0.875rem] text-ink-muted">
              {division.description || 'Belum ada deskripsi divisi.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isOrgAdmin(user.orgRole) && (
              <Button variant="ghost" size="sm" icon={<Archive className="h-4 w-4" />} onClick={() => setArchiving(true)}>
                Arsipkan
              </Button>
            )}
            {division.canManage && (
              <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>
                Ubah
              </Button>
            )}
            {division.canManage && (
              <Button size="sm" icon={<FolderPlus className="h-4 w-4" />} onClick={() => setCreatingProject(true)}>
                Proyek baru
              </Button>
            )}
          </div>
        </div>

        <nav aria-label="Bagian divisi" role="tablist" className="-mb-px mt-5 flex items-center gap-7">
          <HeaderTab active={tab === 'projects'} onClick={() => setTab('projects')} icon={<FolderKanban />} count={division.projectCount}>
            Proyek
          </HeaderTab>
          <HeaderTab active={tab === 'members'} onClick={() => setTab('members')} icon={<Users />} count={division.memberCount}>
            Anggota
          </HeaderTab>
        </nav>
      </header>

      <div className="flex-1 px-8 py-6">
        {tab === 'members' ? (
          <DivisionMembers division={division} />
        ) : projects.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-44 rounded-2xl" />
            ))}
          </div>
        ) : projects.isError ? (
          <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
        ) : projects.data.length === 0 ? (
          <div className="rounded-2xl bg-surface py-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <EmptyState icon={<FolderPlus />} title="Belum ada proyek" description="Proyek di divisi ini akan muncul di sini." />
          </div>
        ) : (
          <ProjectGrid projects={projects.data} />
        )}
      </div>

      <CreateProjectModal divisionId={division.id} open={creatingProject} onClose={() => setCreatingProject(false)} />
      {editing && <DivisionFormModal open division={division} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={archiving}
        title={`Arsipkan divisi ${division.name}?`}
        description="Divisi dan proyeknya tidak akan tampil lagi. Data tetap tersimpan."
        confirmLabel="Arsipkan"
        destructive
        loading={archive.isPending}
        onClose={() => setArchiving(false)}
        onConfirm={() => archive.mutate(division.id, { onSuccess: () => navigate('/divisions', { replace: true }) })}
      />
    </>
  );
}

function DivisionGlyph({ color, large }: { color: string; large?: boolean }) {
  return (
    <span
      aria-hidden
      className={clsx('inline-block shrink-0 rounded-full', large ? 'h-[22px] w-[22px] border-[5px]' : 'h-3.5 w-3.5 border-[3px]')}
      style={{ borderColor: color }}
    />
  );
}

function HeaderTab({
  active,
  onClick,
  icon,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  count: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'relative inline-flex items-center gap-2 pb-3.5 text-[0.875rem] transition-colors [&>svg]:h-4 [&>svg]:w-4',
        "after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:content-['']",
        active ? 'font-semibold text-ink after:bg-brand' : 'font-medium text-ink-muted after:bg-transparent hover:text-ink',
      )}
    >
      {icon}
      {children}
      <span
        className={clsx(
          'flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums',
          active ? 'bg-brand-subtle text-brand-strong' : 'bg-canvas-deep text-ink-subtle',
        )}
      >
        {count}
      </span>
    </button>
  );
}
