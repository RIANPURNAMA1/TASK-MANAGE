import { MessagesSquare } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { EmptyState } from '../../components/ui';
import { ChannelList } from './ChannelList';
import { ChannelView } from './ChannelView';

/** Chat Tim (FR-31 – FR-34): channel sidebar + conversation canvas (DESIGN 5.1 split view). */
export function ChatPage() {
  const { channelId } = useParams();

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-line bg-surface">
        <ChannelList activeId={channelId} />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col bg-paper">
        {channelId ? (
          // Keyed so drafts, scroll position and room membership reset per channel.
          <ChannelView key={channelId} channelId={channelId} />
        ) : (
          <div className="m-auto w-full max-w-md p-6">
            <EmptyState
              icon={<MessagesSquare />}
              title="Pilih percakapan"
              description="Buka chat proyek di sebelah kiri, atau mulai pesan langsung dengan rekan kerja."
            />
          </div>
        )}
      </section>
    </div>
  );
}
