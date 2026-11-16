import { Link } from 'react-router-dom';
import { Archive, ArrowUpRight, Globe2, Layers, Lock, Users } from 'lucide-react';
import type { ProjectDTO } from '@nexus/shared';
import { Button } from '../../components/ui';
import { ProjectGlyph } from '../../components/layout/ProjectSidebar';
import { useJoinProject } from './hooks';

export function ProjectGrid({ projects, showDivision }: { projects: ProjectDTO[]; showDivision?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} showDivision={showDivision} />
      ))}
    </div>
  );
}

/** Project tile in the Kanban card style: glyph + name, description, then a meta footer. */
function ProjectCard({ project, showDivision }: { project: ProjectDTO; showDivision?: boolean }) {
  const join = useJoinProject();
  const canJoin = !project.myRole && !project.isPrivate && !project.archivedAt;

  return (
    <article className="group relative flex flex-col rounded-2xl border border-transparent bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] duration-200 hover:border-line hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]">
      <div className="flex-1 px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <ProjectGlyph color={project.color} className="mt-1 h-4 w-4 rounded-[5px] border-[3px]" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[0.9375rem] font-bold leading-snug text-ink">
              <Link to={`/projects/${project.id}`} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none">
                {project.name}
              </Link>
            </h3>
            {showDivision && <p className="mt-0.5 truncate text-caption text-ink-subtle">{project.divisionName}</p>}
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        </div>
        <p className="mt-2.5 line-clamp-2 min-h-[2.75em] text-[0.8125rem] leading-relaxed text-ink-subtle">
          {project.description || 'Tanpa deskripsi.'}
        </p>
      </div>

      <footer className="flex min-h-[52px] items-center gap-4 border-t border-line-subtle px-5 py-3 text-[0.75rem] font-semibold text-ink-subtle">
        {project.archivedAt ? (
          <span className="inline-flex items-center gap-1 text-warning-ink">
            <Archive className="h-3.5 w-3.5" aria-hidden /> Diarsipkan
          </span>
        ) : project.isPrivate ? (
          <span className="inline-flex items-center gap-1" title="Hanya anggota yang bisa melihat">
            <Lock className="h-3.5 w-3.5" aria-hidden /> Privat
          </span>
        ) : (
          <span className="inline-flex items-center gap-1" title="Semua anggota divisi bisa melihat">
            <Globe2 className="h-3.5 w-3.5" aria-hidden /> Publik
          </span>
        )}
        <span className="inline-flex items-center gap-1 tabular-nums" title={`${project.memberCount} anggota`}>
          <Users className="h-3.5 w-3.5" aria-hidden /> {project.memberCount}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums" title={`${project.openCardCount} kartu aktif`}>
          <Layers className="h-3.5 w-3.5" aria-hidden /> {project.openCardCount} kartu
        </span>
        {canJoin && (
          <Button
            size="sm"
            variant="subtle"
            className="relative z-10 ml-auto h-7 rounded-lg"
            loading={join.isPending}
            onClick={() => join.mutate(project.id)}
          >
            Gabung
          </Button>
        )}
      </footer>
    </article>
  );
}
