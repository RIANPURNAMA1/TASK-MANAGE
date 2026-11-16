import { useMemo, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { ChevronDown, CircleCheckBig, Plus, Search } from 'lucide-react';
import type { ProjectDTO } from '@nexus/shared';
import { useChannelsQuery } from '../../features/chat/hooks';
import { useProjectsQuery } from '../../features/projects/hooks';
import { useCurrentUser } from '../../stores/auth';
import { useUiStore } from '../../stores/ui';
import { Skeleton } from '../ui';

/** Outline square in the project's color — the project's "glyph" across the app. */
export function ProjectGlyph({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={clsx('inline-block shrink-0 rounded-[4px] border-2', className ?? 'h-3.5 w-3.5')}
      style={{ borderColor: color }}
      aria-hidden
    />
  );
}

function SectionHeading({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex w-full items-center gap-2 px-3 pb-1.5 pt-4 text-caption font-bold uppercase tracking-[0.08em] text-ink-subtle hover:text-ink"
    >
      <ChevronDown className={clsx('h-3.5 w-3.5 transition-transform', !open && '-rotate-90')} />
      <span className="truncate">{label}</span>
    </button>
  );
}

function ProjectLink({ project, unread }: { project: ProjectDTO; unread: number }) {
  return (
    <NavLink
      to={`/projects/${project.id}`}
      className={({ isActive }) =>
        clsx(
          'flex items-center gap-3 rounded-xl px-3 py-2 text-[0.875rem] transition-colors',
          isActive ? 'bg-canvas-deep font-bold text-ink' : 'font-medium text-ink-muted hover:bg-canvas hover:text-ink',
        )
      }
    >
      <ProjectGlyph color={project.color} />
      <span className="min-w-0 flex-1 truncate">{project.name}</span>
      {unread > 0 && (
        <span
          className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white"
          aria-label={`${unread} pesan belum dibaca`}
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </NavLink>
  );
}

/**
 * Workspace sidebar (second column): search, shortcuts and every visible project grouped
 * by division. Red badges are unread project-chat messages.
 */
export function ProjectSidebar() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const openPalette = useUiStore((s) => s.setCommandPaletteOpen);
  const projects = useProjectsQuery();
  const channels = useChannelsQuery();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const unreadByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of channels.data ?? []) if (c.project) map.set(c.project.id, c.unreadCount);
    return map;
  }, [channels.data]);

  const groups = useMemo(() => {
    const byDivision = new Map<string, { name: string; projects: ProjectDTO[] }>();
    for (const p of projects.data ?? []) {
      const group = byDivision.get(p.divisionId) ?? { name: p.divisionName, projects: [] };
      group.projects.push(p);
      byDivision.set(p.divisionId, group);
    }
    return [...byDivision.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name));
  }, [projects.data]);

  const toggle = (id: string) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-4 pb-2 pt-5">
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-ink-subtle transition-colors hover:bg-canvas"
        >
          <Search className="h-[18px] w-[18px]" />
          <span className="flex-1 text-left text-[0.875rem]">Cari…</span>
          <kbd className="rounded-md border border-line px-1.5 font-sans text-[11px] font-medium">Ctrl K</kbd>
        </button>
      </div>

      <nav aria-label="Proyek" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <SectionHeading label="Pintasan" open={!collapsed.shortcuts} onToggle={() => toggle('shortcuts')} />
        {!collapsed.shortcuts && (
          <NavLink
            to="/my-tasks"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-[0.875rem] transition-colors',
                isActive ? 'bg-canvas-deep font-bold text-ink' : 'font-medium text-ink-muted hover:bg-canvas hover:text-ink',
              )
            }
          >
            <CircleCheckBig className="h-4 w-4 text-success" />
            Tugas Saya
          </NavLink>
        )}

        {projects.isPending && (
          <div className="space-y-2 px-3 pt-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        )}

        {groups.map(([divisionId, group]) => (
          <div key={divisionId}>
            <SectionHeading label={group.name} open={!collapsed[divisionId]} onToggle={() => toggle(divisionId)} />
            {!collapsed[divisionId] &&
              group.projects.map((p) => <ProjectLink key={p.id} project={p} unread={unreadByProject.get(p.id) ?? 0} />)}
          </div>
        ))}

        {projects.data?.length === 0 && (
          <p className="px-3 pt-5 text-body text-ink-subtle">Belum ada proyek yang bisa Anda akses.</p>
        )}
      </nav>

      {user.orgRole !== 'GUEST' && (
        <div className="border-t border-line-subtle p-4">
          <button
            type="button"
            onClick={() => navigate('/divisions')}
            className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-canvas-deep text-[0.875rem] font-bold text-ink transition-colors hover:bg-line"
          >
            <Plus className="h-4 w-4" /> Proyek Baru
          </button>
        </div>
      )}
    </aside>
  );
}
