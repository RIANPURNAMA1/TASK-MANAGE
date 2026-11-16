import { Link } from 'react-router-dom';
import { KanbanSquare } from 'lucide-react';
import type { ChannelDetail } from '@nexus/shared';
import { AvatarStack } from '../../components/ui';
import { ChannelIcon } from './ChannelList';
import { useIsOnline } from './stores';

export function ChannelHeader({ channel }: { channel: ChannelDetail }) {
  const peerOnline = useIsOnline(channel.peer?.id);
  const project = channel.type === 'PROJECT';

  return (
    <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-line bg-surface px-6">
      <ChannelIcon channel={channel} size="lg" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-[1rem] font-bold leading-tight text-ink">{channel.name}</h2>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-caption text-ink-subtle">
          {project ? (
            <>Chat proyek · {channel.members.length} anggota</>
          ) : (
            <>
              <span className={peerOnline ? 'h-2 w-2 rounded-full bg-success' : 'h-2 w-2 rounded-full bg-line-strong'} aria-hidden />
              <span className={peerOnline ? 'font-medium text-success-ink' : undefined}>{peerOnline ? 'Online' : 'Offline'}</span>
            </>
          )}
        </p>
      </div>
      {project && (
        <div className="flex items-center gap-3">
          <AvatarStack users={channel.members.map((m) => m.user)} max={4} size="md" />
          {channel.project && (
            <>
              <span className="h-7 w-px bg-line" aria-hidden />
              <Link
                to={`/projects/${channel.project.id}`}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 text-[0.8125rem] font-bold text-ink transition-colors hover:border-line-strong hover:bg-canvas"
              >
                <KanbanSquare className="h-4 w-4 text-ink-subtle" /> Buka board
              </Link>
            </>
          )}
        </div>
      )}
    </header>
  );
}
