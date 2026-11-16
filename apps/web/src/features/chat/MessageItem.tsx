import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertCircle, Ban, Check, CheckCheck, Clock3, CornerUpLeft, Pencil, Reply, RotateCcw, Trash2 } from 'lucide-react';
import type { ChannelDetail, MessageDTO, UserSummary } from '@nexus/shared';
import { Avatar, Button, ConfirmDialog } from '../../components/ui';
import { plainText } from '../../lib/chatMarkdown';
import { formatDateTime } from '../../lib/format';
import { useCurrentUser } from '../../stores/auth';
import { AttachmentItem } from '../card/Attachments';
import { MentionTextarea, activeMentionIds } from '../card/MentionTextarea';
import { timeLabel } from './format';
import { useMessageMutations, useSendMessage } from './hooks';
import type { ViewMessage } from './MessageList';
import { EmojiPickerButton, ReactionBar } from './Reactions';
import { RichText } from './RichText';

interface MessageItemProps {
  message: ViewMessage;
  channel: ChannelDetail;
  members: UserSummary[];
  startsGroup: boolean;
  highlighted: boolean;
  /** Read receipt for the caller's latest message ("Dibaca", "Terkirim", "Dibaca 2 orang"). */
  status: string | null;
  onReply: (message: MessageDTO) => void;
  onJumpTo: (messageId: string) => void;
}

/**
 * One chat bubble. Others: white bubble on the left with avatar + name on the first
 * message of a run. Own: soft blue bubble on the right. Time, "diedit" and delivery
 * ticks sit inside the bubble's last line so the conversation reads without clutter.
 */
export function MessageItem({ message, channel, members, startsGroup, highlighted, status, onReply, onJumpTo }: MessageItemProps) {
  const me = useCurrentUser();
  const { edit, remove, react } = useMessageMutations();
  const { retry } = useSendMessage();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const mine = message.author.id === me.id;
  const deleted = message.deletedAt !== null;
  const pending = message.pending;
  const interactive = !pending && !deleted && channel.canPost;
  const showName = startsGroup && !mine && channel.type === 'PROJECT';

  const stamp = (
    <Stamp
      message={message}
      mine={mine}
      status={status}
      // Floats onto the last text line (or below it when the line is full).
      className={message.body && !deleted ? 'float-right ml-3 mt-[0.4rem]' : 'mt-1 flex justify-end'}
    />
  );

  return (
    <div
      id={`msg-${message.id}`}
      className={clsx(
        'group flex gap-2.5 rounded-xl px-1 transition-colors duration-500',
        startsGroup ? 'pt-4' : 'pt-1',
        mine && 'justify-end',
        highlighted && 'bg-warning-soft',
      )}
    >
      {!mine && <div className="w-8 shrink-0 pt-0.5">{startsGroup && <Avatar user={message.author} size="md" />}</div>}

      <div className={clsx('flex min-w-0 max-w-[min(75%,48rem)] flex-col', mine ? 'items-end' : 'items-start')}>
        {showName && <p className="mb-1 px-1 text-[0.8125rem] font-bold text-ink">{message.author.name}</p>}

        <div className="relative max-w-full">
          <div
            className={clsx(
              'min-w-0 rounded-2xl px-3.5 py-2 text-[0.9375rem] leading-[1.6]',
              deleted
                ? 'border border-dashed border-line-strong bg-transparent text-ink-subtle'
                : editing
                  ? 'border border-line bg-surface shadow-card'
                  : mine
                    ? 'bg-brand-subtle text-ink ring-1 ring-inset ring-brand-border/70'
                    : 'bg-surface text-ink shadow-card ring-1 ring-inset ring-line-subtle',
              startsGroup && (mine ? 'rounded-tr-md' : 'rounded-tl-md'),
              pending?.status === 'sending' && 'opacity-70',
              pending?.status === 'failed' && 'ring-danger/40',
            )}
          >
            {message.replyTo && !deleted && !editing && (
              <button
                type="button"
                onClick={() => onJumpTo(message.replyTo!.id)}
                className={clsx(
                  'mb-1.5 mt-0.5 block w-full min-w-[12rem] rounded-lg border-l-[3px] border-brand px-2.5 py-1.5 text-left transition-colors',
                  mine ? 'bg-surface/70 hover:bg-surface' : 'bg-canvas-deep/80 hover:bg-canvas-deep',
                )}
              >
                <span className="flex items-center gap-1 text-caption font-bold text-brand-strong">
                  <CornerUpLeft className="h-3 w-3" aria-hidden />
                  {message.replyTo.authorName}
                </span>
                <span className="line-clamp-2 text-[0.8125rem] leading-snug text-ink-muted">
                  {message.replyTo.deleted ? 'Pesan telah dihapus' : plainText(message.replyTo.body) || '📎 Lampiran'}
                </span>
              </button>
            )}

            {deleted ? (
              <p className="flex items-center gap-1.5 text-[0.875rem] italic">
                <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />
                Pesan ini telah dihapus
                <span className="ml-2 text-[11px] not-italic">{timeLabel(message.createdAt)}</span>
              </p>
            ) : editing ? (
              <EditForm
                message={message}
                members={members}
                saving={edit.isPending}
                onCancel={() => setEditing(false)}
                onSave={(body, mentionIds) =>
                  edit.mutate({ id: message.id, body, mentionIds }, { onSuccess: () => setEditing(false) })
                }
              />
            ) : (
              <>
                {message.body && <RichText body={message.body} mentions={message.mentions} trailing={stamp} />}
                {message.attachments.length > 0 && (
                  <ul className={clsx('grid gap-1.5', message.body ? 'mt-2' : 'mt-1 min-w-[16rem]')}>
                    {message.attachments.map((a) => (
                      <AttachmentItem key={a.id} attachment={a} canEdit={false} />
                    ))}
                  </ul>
                )}
                {!message.body && stamp}
              </>
            )}
          </div>

          {interactive && !editing && (
            <div
              className={clsx(
                'absolute -top-4 z-10 flex items-center gap-0.5 rounded-xl border border-line bg-surface p-0.5 shadow-card-hover',
                'pointer-events-none opacity-0 transition-opacity duration-150',
                'group-hover:pointer-events-auto group-hover:opacity-100 focus-within:pointer-events-auto focus-within:opacity-100',
                mine ? 'right-2' : 'left-2',
              )}
            >
              <ActionButton label="Balas" onClick={() => onReply(message)}>
                <Reply className="h-4 w-4" />
              </ActionButton>
              <EmojiPickerButton align={mine ? 'right' : 'left'} onPick={(emoji) => react.mutate({ id: message.id, emoji })} />
              {mine && (
                <>
                  <ActionButton label="Edit" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4" />
                  </ActionButton>
                  <ActionButton label="Hapus" danger onClick={() => setConfirming(true)}>
                    <Trash2 className="h-4 w-4" />
                  </ActionButton>
                </>
              )}
            </div>
          )}
        </div>

        {!deleted && (
          <ReactionBar
            reactions={message.reactions}
            myId={me.id}
            onToggle={(emoji) => channel.canPost && react.mutate({ id: message.id, emoji })}
          />
        )}

        {pending?.status === 'failed' && (
          <p className="mt-1 flex items-center gap-2 px-1 text-caption text-danger-ink">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            Gagal terkirim.
            <button type="button" onClick={() => void retry(pending)} className="inline-flex items-center gap-1 font-bold hover:underline">
              <RotateCcw className="h-3 w-3" /> Coba lagi
            </button>
          </p>
        )}
        {status && channel.type === 'PROJECT' && status !== 'Terkirim' && (
          <p className="mt-1 px-1 text-[11px] text-ink-subtle">{status}</p>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title="Hapus pesan?"
        description="Pesan akan diganti dengan keterangan “Pesan ini telah dihapus” untuk semua orang."
        confirmLabel="Hapus"
        destructive
        loading={remove.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate(message.id, { onSuccess: () => setConfirming(false) })}
      />
    </div>
  );
}

/** "diedit · 10:32 ✓✓" — tucked into the bubble's last line. */
function Stamp({
  message,
  mine,
  status,
  className,
}: {
  message: ViewMessage;
  mine: boolean;
  status: string | null;
  className: string;
}) {
  const pending = message.pending;
  const read = status?.startsWith('Dibaca');

  let tick: ReactNode = null;
  let tickLabel = 'Terkirim';
  if (mine) {
    if (pending?.status === 'sending') {
      tick = <Clock3 className="h-3 w-3" />;
      tickLabel = 'Mengirim…';
    } else if (pending?.status === 'failed') {
      tick = <AlertCircle className="h-3 w-3 text-danger" />;
      tickLabel = 'Gagal terkirim';
    } else if (read) {
      tick = <CheckCheck className="h-3.5 w-3.5 text-brand" />;
      tickLabel = status ?? 'Dibaca';
    } else {
      tick = <Check className="h-3.5 w-3.5" />;
    }
  }

  return (
    <span className={clsx('select-none whitespace-nowrap text-[11px] leading-none text-ink-subtle', className)}>
      <span className="inline-flex items-center gap-1">
        {message.editedAt && <span>diedit ·</span>}
        <time dateTime={message.createdAt} title={formatDateTime(message.createdAt)} className="tabular-nums">
          {timeLabel(message.createdAt)}
        </time>
        {tick && (
          <span role="img" aria-label={tickLabel} title={tickLabel} className="inline-flex">
            {tick}
          </span>
        )}
      </span>
    </span>
  );
}

function EditForm({
  message,
  members,
  saving,
  onCancel,
  onSave,
}: {
  message: MessageDTO;
  members: UserSummary[];
  saving: boolean;
  onCancel: () => void;
  onSave: (body: string, mentionIds: string[]) => void;
}) {
  const [draft, setDraft] = useState(message.body);
  const [picked, setPicked] = useState<UserSummary[]>(message.mentions);
  const save = () => draft.trim() && onSave(draft.trim(), activeMentionIds(draft, picked));

  return (
    <div className="w-[min(560px,65vw)] space-y-2 py-1">
      <MentionTextarea
        chat
        formatting
        autoFocus
        value={draft}
        onChange={setDraft}
        members={members}
        onMention={(u) => setPicked((p) => [...p, u])}
        onSubmit={save}
        onEscape={onCancel}
      />
      <div className="flex items-center gap-2">
        <Button size="sm" loading={saving} disabled={!draft.trim()} onClick={save}>
          Simpan
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <span className="ml-auto text-caption text-ink-subtle">Esc batal · Enter simpan</span>
      </div>
    </div>
  );
}

function ActionButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={clsx(
        'flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-canvas-deep',
        danger ? 'hover:text-danger' : 'hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}
