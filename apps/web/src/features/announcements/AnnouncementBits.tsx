import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Building2, FolderKanban, Globe2, Pin } from 'lucide-react';
import type { AnnouncementSummary } from '@nexus/shared';
import { readableTextOn } from '../../lib/color';

const SOLID = 'inline-flex h-[22px] max-w-[220px] shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold [&>svg]:h-3 [&>svg]:w-3';

/** Solid pill naming who the announcement is for, in the target's own color. */
export function ScopeBadge({ announcement, className }: { announcement: Pick<AnnouncementSummary, 'scope' | 'division' | 'project'>; className?: string }) {
  const { scope, division, project } = announcement;
  let color = '#0070F3';
  let icon: ReactNode = <Globe2 aria-hidden />;
  let label = 'Perusahaan';
  if (scope === 'DIVISION' && division) {
    color = division.color;
    icon = <Building2 aria-hidden />;
    label = `Divisi ${division.name}`;
  } else if (scope === 'PROJECT' && project) {
    color = project.color;
    icon = <FolderKanban aria-hidden />;
    label = project.name;
  }
  return (
    <span className={clsx(SOLID, className)} style={{ backgroundColor: color, color: readableTextOn(color) }} title={label}>
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}

export function PinnedBadge() {
  return (
    <span className={clsx(SOLID, 'bg-warning text-white')}>
      <Pin aria-hidden className="rotate-45" />
      Disematkan
    </span>
  );
}

export function NewBadge() {
  return <span className={clsx(SOLID, 'bg-danger text-white')}>Baru</span>;
}
