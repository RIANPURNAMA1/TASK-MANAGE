import { useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { Plus, Search } from 'lucide-react';
import type { ChannelDTO } from '@nexus/shared';
import { Avatar, Button, ErrorState, Input, Skeleton } from '../../components/ui';
import { useCurrentUser } from '../../stores/auth';
import { shortStamp, previewText } from './format';
import { useChannelsQuery } from './hooks';
import { NewDirectModal } from './NewDirectModal';
import { useIsOnline } from './stores';

const byRecent = (a: ChannelDTO, b: ChannelDTO) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '');

export function ChannelList({ activeId }: { activeId: string | undefined }) {
  const channels = useChannelsQuery();
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);

  const { projects, directs } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = (channels.data ?? []).filter((c) => !q || c.name.toLowerCase().includes(q)).sort(byRecent);
    return {
      projects: visible.filter((c) => c.type === 'PROJECT'),
      directs: visible.filter((c) => c.type === 'DIRECT'),
    };
  }, [channels.data, search]);

  return (
    <>
      <div className="space-y-3 border-b border-line-subtle p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-h2 text-ink">Chat Tim</h1>
          <Button size="sm" variant="subtle" icon={<Plus className="h-4 w-4" />} onClick={() => setComposing(true)}>
            Pesan baru
          </Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari percakapan…"
            aria-label="Cari percakapan"
            className="pl-9"
          />
        </div>
      </div>

      <nav aria-label="Daftar percakapan" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {channels.isPending ? (
          <div className="space-y-2 px-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : channels.isError ? (
          <ErrorState error={channels.error} onRetry={() => void channels.refetch()} />
        ) : (
          <>
            <Section title="Proyek" channels={projects} activeId={activeId} empty="Belum ada chat proyek." />
            <Section title="Pesan Langsung" channels={directs} activeId={activeId} empty="Belum ada pesan langsung." />
          </>
        )}
      </nav>

      <NewDirectModal open={composing} onClose={() => setComposing(false)} />
    </>
  );
}

function Section({
  title,
  channels,
  activeId,
  empty,
}: {
  title: string;
  channels: ChannelDTO[];
  activeId: string | undefined;
  empty: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="px-2 pb-1 text-caption font-semibold uppercase tracking-wide text-ink-subtle">{title}</h2>
      {channels.length === 0 ? (
        <p className="px-2 py-1 text-caption text-ink-subtle">{empty}</p>
      ) : (
        <ul className="space-y-0.5">
          {channels.map((c) => (
            <li key={c.id}>
              <ChannelItem channel={c} active={c.id === activeId} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChannelItem({ channel, active }: { channel: ChannelDTO; active: boolean }) {
  const me = useCurrentUser();
  const unread = channel.unreadCount > 0;
  const last = channel.lastMessage;
  const author = last && channel.type === 'PROJECT' ? `${last.authorName === me.name ? 'Anda' : last.authorName}: ` : '';

  return (
    <NavLink
      to={`/chat/${channel.id}`}
      className={clsx(
        'flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors',
        active ? 'bg-brand-subtle' : 'hover:bg-canvas',
      )}
    >
      <ChannelIcon channel={channel} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={clsx('truncate', unread ? 'font-bold text-ink' : 'font-medium text-ink')}>{channel.name}</span>
          {last && <span className="shrink-0 text-caption text-ink-subtle">{shortStamp(last.createdAt)}</span>}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className={clsx('truncate text-caption', unread ? 'text-ink-muted' : 'text-ink-subtle')}>
            {last ? author + previewText(last.body) : 'Belum ada pesan'}
          </span>
          {unread && (
            <span
              className="shrink-0 rounded-full bg-brand px-1.5 text-[11px] font-medium leading-4 text-white"
              aria-label={`${channel.unreadCount} pesan belum dibaca`}
            >
              {channel.unreadCount > 99 ? '99+' : channel.unreadCount}
            </span>
          )}
        </span>
      </span>
    </NavLink>
  );
}

export function ChannelIcon({ channel, size = 'md' }: { channel: ChannelDTO; size?: 'md' | 'lg' }) {
  const online = useIsOnline(channel.peer?.id);
  if (channel.peer) {
    return (
      <span className="relative shrink-0">
        <Avatar user={channel.peer} size={size} />
        <PresenceDot online={online} />
      </span>
    );
  }
  return (
    <span
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-lg font-bold text-white',
        size === 'lg' ? 'h-10 w-10 text-h3' : 'h-8 w-8 text-caption',
      )}
      style={{ backgroundColor: channel.project?.color ?? '#2652A0' }}
      aria-hidden
    >
      #
    </span>
  );
}

export function PresenceDot({ online }: { online: boolean }) {
  return (
    <span
      className={clsx(
        'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface',
        online ? 'bg-success' : 'bg-line',
      )}
      aria-label={online ? 'Online' : 'Offline'}
    />
  );
}
