import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Megaphone } from 'lucide-react';
import { formatRelative } from '../../lib/format';
import { PinnedBadge, ScopeBadge } from '../announcements/AnnouncementBits';
import { useAnnouncementList } from '../announcements/hooks';
import { EmptyLine, Panel, PanelLink, SolidBadge } from './DashboardSections';

/** Pinned first, then the newest — at most four, so the column stays short. */
export function AnnouncementsPanel() {
  const list = useAnnouncementList({});
  const first = list.data?.pages[0];
  const rows = [...(first?.pinned ?? []), ...(first?.items ?? [])].slice(0, 4);
  const unread = first?.unreadCount ?? 0;

  return (
    <Panel
      title="Pengumuman"
      description={unread > 0 ? <SolidBadge tone="danger">{unread} belum dibaca</SolidBadge> : 'Semua sudah dibaca'}
      bodyClassName=""
      action={<PanelLink to="/announcements">Semua</PanelLink>}
    >
      {list.isPending ? (
        <div className="h-24 animate-pulse" />
      ) : rows.length === 0 ? (
        <EmptyLine>Belum ada pengumuman.</EmptyLine>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {rows.map((a) => (
            <li key={a.id}>
              <Link to={`/announcements/${a.id}`} className="group flex gap-3 px-5 py-3.5 transition-colors hover:bg-canvas/70">
                <span className={clsx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', a.isRead ? 'bg-canvas-deep text-ink-subtle' : 'bg-brand text-white')}>
                  <Megaphone className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <ScopeBadge announcement={a} className="max-w-[160px]" />
                    {a.pinnedAt && <PinnedBadge />}
                  </span>
                  <span className={clsx('mt-1.5 block truncate text-[0.8125rem] text-ink group-hover:text-brand-strong', a.isRead ? 'font-semibold' : 'font-bold')}>
                    {a.title}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-ink-subtle">
                    {a.author.name} · {formatRelative(a.createdAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
