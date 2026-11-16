import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, Building2, CheckCheck, FolderKanban, Globe2, Inbox, Layers, Megaphone, MessageSquare, Plus, Search } from 'lucide-react';
import type { AnnouncementScope, AnnouncementSummary } from '@nexus/shared';
import { Avatar, Button, ErrorState, Input, Skeleton } from '../../components/ui';
import { formatRelative } from '../../lib/format';
import { NewBadge, PinnedBadge, ScopeBadge } from './AnnouncementBits';
import { AnnouncementDetailView } from './AnnouncementDetailView';
import { ComposerModal } from './ComposerModal';
import { useAnnouncementList, useAnnouncementMutations, useAnnouncementTargets, type AnnouncementFilter } from './hooks';

type Tab = 'ALL' | AnnouncementScope;

const TABS: { value: Tab; label: string; icon: ReactNode }[] = [
  { value: 'ALL', label: 'Semua', icon: <Layers /> },
  { value: 'ORGANIZATION', label: 'Perusahaan', icon: <Globe2 /> },
  { value: 'DIVISION', label: 'Divisi', icon: <Building2 /> },
  { value: 'PROJECT', label: 'Proyek', icon: <FolderKanban /> },
];

/** Announcements (FR-35/36): filterable feed on the left, the open announcement on the right. */
export function AnnouncementsPage() {
  const { announcementId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('ALL');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [composing, setComposing] = useState(false);
  const targets = useAnnouncementTargets();
  const { markAllRead } = useAnnouncementMutations();

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const filter: AnnouncementFilter = useMemo(
    () => ({ scope: tab === 'ALL' ? undefined : tab, q: q || undefined, unread: unreadOnly || undefined }),
    [tab, q, unreadOnly],
  );
  const list = useAnnouncementList(filter);
  const first = list.data?.pages[0];
  const pinned = first?.pinned ?? [];
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unreadCount = first?.unreadCount ?? 0;
  const canPost = Boolean(
    targets.data && (targets.data.organization || targets.data.divisions.length > 0 || targets.data.projects.length > 0),
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas-deep/60">
      <header className="shrink-0 border-b border-line bg-surface px-8 pt-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
              <Megaphone className="h-[22px] w-[22px] text-brand" aria-hidden />
              Pengumuman
            </h1>
            <p className="mt-2 text-[0.875rem] text-ink-muted">Info resmi dari perusahaan, divisi, dan proyek Anda.</p>
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                icon={<CheckCheck className="h-4 w-4" />}
                loading={markAllRead.isPending}
                onClick={() => markAllRead.mutate()}
              >
                Tandai semua dibaca
              </Button>
            )}
            {canPost && (
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setComposing(true)}>
                Buat pengumuman
              </Button>
            )}
          </div>
        </div>

        <nav aria-label="Filter pengumuman" role="tablist" className="-mb-px mt-5 flex items-center gap-7 overflow-x-auto">
          {TABS.map((t) => {
            const active = t.value === tab;
            return (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.value)}
                className={clsx(
                  'relative inline-flex shrink-0 items-center gap-2 pb-3.5 text-[0.875rem] transition-colors [&>svg]:h-4 [&>svg]:w-4',
                  "after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:content-['']",
                  active ? 'font-semibold text-ink after:bg-brand' : 'font-medium text-ink-muted after:bg-transparent hover:text-ink',
                )}
              >
                {t.icon}
                {t.label}
                {t.value === 'ALL' && unreadCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* List */}
        <section
          aria-label="Daftar pengumuman"
          className={clsx(
            'min-h-0 w-full shrink-0 flex-col border-r border-line lg:flex lg:w-[420px]',
            announcementId ? 'hidden' : 'flex',
          )}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface/70 px-5 py-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari pengumuman…"
                aria-label="Cari pengumuman"
                className="h-9 rounded-xl bg-surface pl-9"
              />
            </div>
            <button
              type="button"
              aria-pressed={unreadOnly}
              onClick={() => setUnreadOnly((v) => !v)}
              className={clsx(
                'inline-flex h-9 shrink-0 items-center rounded-xl px-3 text-[0.8125rem] font-semibold transition-colors',
                unreadOnly ? 'bg-brand text-white' : 'border border-line bg-surface text-ink-muted hover:text-ink',
              )}
            >
              Belum dibaca
            </button>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {list.isPending ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)
            ) : list.isError ? (
              <ErrorState error={list.error} onRetry={() => void list.refetch()} />
            ) : pinned.length === 0 && items.length === 0 ? (
              <EmptyList filtered={Boolean(q || unreadOnly || tab !== 'ALL')} canPost={canPost} onCompose={() => setComposing(true)} />
            ) : (
              <>
                {pinned.length > 0 && (
                  <Group label="Disematkan">
                    {pinned.map((a) => (
                      <ListItem key={a.id} announcement={a} active={a.id === announcementId} />
                    ))}
                  </Group>
                )}
                {items.length > 0 && (
                  <Group label="Terbaru">
                    {items.map((a) => (
                      <ListItem key={a.id} announcement={a} active={a.id === announcementId} />
                    ))}
                  </Group>
                )}
                {list.hasNextPage && (
                  <Button
                    variant="secondary"
                    className="w-full rounded-xl"
                    loading={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    Muat lebih banyak
                  </Button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Detail */}
        <section aria-label="Isi pengumuman" className={clsx('min-h-0 min-w-0 flex-1 overflow-y-auto', !announcementId && 'hidden lg:block')}>
          {announcementId ? (
            <>
              <div className="px-6 pt-4 lg:hidden">
                <Link to="/announcements" className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ink-muted hover:text-ink">
                  <ArrowLeft className="h-4 w-4" /> Semua pengumuman
                </Link>
              </div>
              <AnnouncementDetailView key={announcementId} id={announcementId} onDeleted={() => navigate('/announcements', { replace: true })} />
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-sm text-center">
                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_10px_24px_-12px_rgba(0,112,243,0.7)]">
                  <Megaphone className="h-6 w-6" />
                </span>
                <p className="mt-4 text-[1rem] font-bold text-ink">Pilih pengumuman</p>
                <p className="mt-1 text-[0.8125rem] text-ink-subtle">Buka salah satu pengumuman di sebelah kiri untuk membaca isi lengkap dan komentarnya.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {composing && (
        <ComposerModal open onClose={() => setComposing(false)} onCreated={(id) => navigate(`/announcements/${id}`)} />
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 px-1 text-caption font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</h2>
      <ul className="space-y-2.5">{children}</ul>
    </div>
  );
}

function ListItem({ announcement: a, active }: { announcement: AnnouncementSummary; active: boolean }) {
  return (
    <li>
      <Link
        to={`/announcements/${a.id}`}
        aria-current={active ? 'page' : undefined}
        className={clsx(
          'relative block rounded-2xl border bg-surface p-4 transition-[border-color,box-shadow] duration-200',
          active
            ? 'border-brand shadow-[0_0_0_1px_rgb(0,112,243)]'
            : 'border-transparent shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-line hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]',
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5 pr-4">
          <ScopeBadge announcement={a} />
          {a.pinnedAt && <PinnedBadge />}
          {!a.isRead && <NewBadge />}
        </div>
        {!a.isRead && <span className="absolute right-4 top-5 h-2.5 w-2.5 rounded-full bg-danger" aria-label="Belum dibaca" />}
        <h3 className={clsx('mt-2.5 line-clamp-2 text-[0.9375rem] leading-snug text-ink', a.isRead ? 'font-semibold' : 'font-bold')}>
          {a.title}
        </h3>
        {a.excerpt && <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-relaxed text-ink-subtle">{a.excerpt}</p>}
        <div className="mt-3 flex items-center gap-2 border-t border-line-subtle pt-3 text-caption text-ink-subtle">
          <Avatar user={a.author} size="sm" />
          <span className="min-w-0 truncate font-semibold text-ink-muted">{a.author.name}</span>
          <span aria-hidden>·</span>
          <span className="shrink-0">{formatRelative(a.createdAt)}</span>
          {a.commentCount > 0 && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold tabular-nums">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              {a.commentCount}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

function EmptyList({ filtered, canPost, onCompose }: { filtered: boolean; canPost: boolean; onCompose: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-surface px-6 py-10 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-canvas-deep text-ink-subtle">
        <Inbox className="h-5 w-5" />
      </span>
      <p className="mt-3 text-[0.9375rem] font-bold text-ink">{filtered ? 'Tidak ada yang cocok' : 'Belum ada pengumuman'}</p>
      <p className="mt-1 text-[0.8125rem] text-ink-subtle">
        {filtered ? 'Coba ubah filter atau kata kunci pencarian.' : 'Pengumuman dari perusahaan, divisi, dan proyek akan muncul di sini.'}
      </p>
      {!filtered && canPost && (
        <Button size="sm" className="mt-4" icon={<Plus className="h-4 w-4" />} onClick={onCompose}>
          Buat pengumuman
        </Button>
      )}
    </div>
  );
}
