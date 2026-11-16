import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, MessagesSquare } from 'lucide-react';
import { toast } from 'sonner';
import type { ChannelDetail, MessageDTO, UserSummary } from '@nexus/shared';
import { EmptyState, ErrorState, Spinner } from '../../components/ui';
import { useCurrentUser } from '../../stores/auth';
import { ChannelIcon } from './ChannelList';
import { readStatus, toRows, type MessageRow } from './format';
import { MessageItem } from './MessageItem';
import type { PendingMessage } from './stores';

export type ViewMessage = MessageDTO & { pending?: PendingMessage };

const NEAR_EDGE_PX = 120;

interface MessageListProps {
  channel: ChannelDetail;
  messages: ViewMessage[];
  members: UserSummary[];
  loading: boolean;
  error: unknown;
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetryLoad: () => void;
  onReply: (message: MessageDTO) => void;
}

/**
 * Scroll behaviour: starts at the bottom, loads older pages near the top while keeping
 * the visible message in place, and only follows new messages when the reader is
 * already at the bottom (otherwise a "Pesan baru" pill appears).
 */
export function MessageList(props: MessageListProps) {
  const { channel, messages, loading, error, hasOlder, loadingOlder, onLoadOlder } = props;
  const me = useCurrentUser();
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const distanceFromBottom = useRef<number | null>(null);
  const [unseen, setUnseen] = useState(0);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const rows = useMemo(() => toRows(messages), [messages]);
  // One section per day so its date label can stick to the top while scrolling.
  const days = useMemo(() => {
    const out: { label: string; rows: MessageRow[] }[] = [];
    for (const row of rows) {
      if (row.dayBreak || out.length === 0) out.push({ label: row.dayBreak ?? '', rows: [] });
      out[out.length - 1]!.rows.push(row);
    }
    return out;
  }, [rows]);
  const oldestId = messages[0]?.id;
  const newest = messages.at(-1);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setUnseen(0);
  }, []);

  // Older page prepended: restore the reader's position relative to the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && distanceFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - distanceFromBottom.current;
      distanceFromBottom.current = null;
    }
  }, [oldestId]);

  // New message at the bottom (keyed on the id only: edits/reactions must not count as new).
  const newestId = newest?.id;
  const newestIsMine = newest?.author.id === me.id;
  useLayoutEffect(() => {
    if (!newestId) return;
    if (nearBottom.current || newestIsMine) scrollToBottom();
    else setUnseen((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId]);

  const requestOlder = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasOlder || loadingOlder) return;
    distanceFromBottom.current = el.scrollHeight - el.scrollTop;
    onLoadOlder();
  }, [hasOlder, loadingOlder, onLoadOlder]);

  // A short first page may not fill the viewport, so no scroll event would ever fire.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && !loading && el.scrollHeight <= el.clientHeight) requestOlder();
  }, [loading, messages.length, requestOlder]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_EDGE_PX;
    if (nearBottom.current && unseen) setUnseen(0);
    if (el.scrollTop < NEAR_EDGE_PX) requestOlder();
  };

  const jumpTo = (id: string) => {
    const target = document.getElementById(`msg-${id}`);
    if (!target) {
      toast('Pesan asli belum dimuat. Gulir ke atas untuk memuat pesan lama.');
      return;
    }
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setHighlightId(id);
    setTimeout(() => setHighlightId((h) => (h === id ? null : h)), 1600);
  };

  const myLastId = [...messages].reverse().find((m) => m.author.id === me.id && !m.pending && !m.deletedAt)?.id;

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto overflow-x-hidden px-4 pb-4 sm:px-6" role="log" aria-label="Pesan">
        {loading ? (
          <div className="flex h-full items-center justify-center text-brand">
            <Spinner />
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={props.onRetryLoad} />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center">
            <div className="mx-auto w-full max-w-sm">
              <EmptyState
                icon={<MessagesSquare />}
                title="Belum ada pesan"
                description={channel.canPost ? 'Mulai percakapan dengan mengirim pesan pertama.' : undefined}
              />
            </div>
          </div>
        ) : (
          <div className="w-full pb-2">
            {hasOlder || loadingOlder ? (
              <div className="flex h-10 items-center justify-center">
                {loadingOlder && <Spinner className="h-4 w-4 text-brand" />}
              </div>
            ) : (
              <ChannelIntro channel={channel} />
            )}
            {days.map((day) => (
              <section key={day.rows[0]!.message.id} aria-label={day.label}>
                <DaySeparator label={day.label} />
                <ul>
                  {day.rows.map(({ message, startsGroup }) => (
                    <li key={message.id}>
                      <MessageItem
                        message={message}
                        channel={channel}
                        members={props.members}
                        startsGroup={startsGroup}
                        highlighted={highlightId === message.id}
                        status={message.id === myLastId ? readStatus(channel, message, me.id) : null}
                        onReply={props.onReply}
                        onJumpTo={jumpTo}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        {unseen > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="pointer-events-auto inline-flex h-8 items-center gap-1.5 rounded-full bg-ink px-3.5 text-caption font-bold text-white shadow-card-hover transition-colors hover:bg-ink-muted dark:bg-line-strong dark:text-ink dark:hover:bg-line"
          >
            <ArrowDown className="h-3.5 w-3.5" /> {unseen} pesan baru
          </button>
        )}
      </div>
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 flex justify-center pb-1 pt-4" role="separator" aria-label={label}>
      <span className="rounded-full border border-line bg-surface/95 px-3 py-1 text-caption font-bold text-ink-muted shadow-[0_1px_2px_rgba(15,23,42,0.06)] backdrop-blur">
        {label}
      </span>
    </div>
  );
}

/** Shown once the very first message is loaded: what this conversation is. */
function ChannelIntro({ channel }: { channel: ChannelDetail }) {
  const project = channel.type === 'PROJECT';
  return (
    <div className="flex flex-col items-center px-4 pb-2 pt-10 text-center">
      <ChannelIcon channel={channel} size="lg" />
      <h3 className="mt-3 text-[1rem] font-bold text-ink">
        {project ? `Selamat datang di #${channel.name}` : `Percakapan dengan ${channel.name}`}
      </h3>
      <p className="mt-1 max-w-sm text-[0.8125rem] leading-relaxed text-ink-subtle">
        {project
          ? `Ini awal percakapan proyek. Semua ${channel.members.length} anggota bisa membaca dan membalas di sini.`
          : 'Ini awal pesan langsung kalian. Hanya kalian berdua yang bisa melihat percakapan ini.'}
      </p>
    </div>
  );
}
