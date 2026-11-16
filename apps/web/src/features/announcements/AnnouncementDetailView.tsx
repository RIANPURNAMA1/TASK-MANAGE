import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Eye, MessageSquare, MoreHorizontal, Pencil, Pin, PinOff, Send, Trash2 } from 'lucide-react';
import type { AnnouncementCommentDTO, AnnouncementDetail } from '@nexus/shared';
import { Avatar, AvatarStack, Button, ConfirmDialog, ErrorState, Menu, MenuItem, MenuSeparator, Skeleton } from '../../components/ui';
import { formatDateTime, formatRelative } from '../../lib/format';
import { useCurrentUser } from '../../stores/auth';
import { MentionTextarea } from '../card/MentionTextarea';
import { RichText } from '../chat/RichText';
import { PinnedBadge, ScopeBadge } from './AnnouncementBits';
import { ComposerModal } from './ComposerModal';
import {
  useAnnouncement,
  useAnnouncementCommentMutations,
  useAnnouncementComments,
  useAnnouncementMutations,
} from './hooks';

export function AnnouncementDetailView({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const query = useAnnouncement(id);
  const { markRead } = useAnnouncementMutations();
  const markedRef = useRef<string | null>(null);

  // Opening an unread announcement marks it as read (once per id).
  useEffect(() => {
    if (query.data && !query.data.isRead && markedRef.current !== id) {
      markedRef.current = id;
      markRead.mutate(id);
    }
  }, [query.data, id, markRead]);

  if (query.isPending) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-6 w-40 rounded-full" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="m-auto w-full max-w-md p-8">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  return <Detail announcement={query.data} onDeleted={onDeleted} />;
}

function Detail({ announcement: a, onDeleted }: { announcement: AnnouncementDetail; onDeleted: () => void }) {
  const me = useCurrentUser();
  const { pin, remove } = useAnnouncementMutations();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isAuthor = a.author.id === me.id;
  const canEdit = a.canManage || isAuthor;
  const readPct = a.audienceCount > 0 ? Math.round((a.readCount / a.audienceCount) * 100) : 0;

  return (
    <article className="mx-auto w-full max-w-3xl space-y-5 px-6 py-6 lg:px-8">
      <div className="rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle">
        <header className="border-b border-line-subtle px-6 pb-5 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <ScopeBadge announcement={a} />
              {a.pinnedAt && <PinnedBadge />}
            </div>
            {canEdit && (
              <Menu
                className="w-52"
                trigger={({ toggle, open }) => (
                  <button
                    type="button"
                    onClick={toggle}
                    aria-label="Aksi pengumuman"
                    className={clsx(
                      'flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-canvas-deep hover:text-ink',
                      open && 'bg-canvas-deep text-ink',
                    )}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    {a.canManage && (
                      <MenuItem
                        icon={a.pinnedAt ? <PinOff /> : <Pin />}
                        onSelect={() => (close(), pin.mutate({ id: a.id, pinned: !a.pinnedAt }))}
                      >
                        {a.pinnedAt ? 'Lepas sematan' : 'Sematkan di atas'}
                      </MenuItem>
                    )}
                    <MenuItem icon={<Pencil />} onSelect={() => (close(), setEditing(true))}>
                      Ubah pengumuman
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={<Trash2 />} danger onSelect={() => (close(), setConfirming(true))}>
                      Hapus pengumuman
                    </MenuItem>
                  </>
                )}
              </Menu>
            )}
          </div>

          <h1 className="mt-3 text-[1.375rem] font-semibold leading-snug tracking-[-0.015em] text-ink [overflow-wrap:anywhere]">{a.title}</h1>

          <div className="mt-4 flex items-center gap-3">
            <Avatar user={a.author} size="lg" />
            <div className="min-w-0 text-[0.8125rem]">
              <p className="font-semibold text-ink">{a.author.name}</p>
              <p className="text-caption text-ink-subtle">
                <time dateTime={a.createdAt} title={formatDateTime(a.createdAt)}>
                  {formatDateTime(a.createdAt)}
                </time>
                {a.editedAt && <span> · diedit {formatRelative(a.editedAt)}</span>}
                {a.pinnedBy && a.pinnedAt && <span> · disematkan oleh {a.pinnedBy.name}</span>}
              </p>
            </div>
          </div>
        </header>

        {/* Server-sanitized HTML (see lib/sanitize.ts in the API). */}
        <div
          className="prose-nexus px-6 py-5 text-[0.9375rem] leading-[1.7] text-ink [overflow-wrap:anywhere]"
          dangerouslySetInnerHTML={{ __html: a.body }}
        />

        <footer className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-b-2xl border-t border-line-subtle bg-canvas/60 px-6 py-3.5">
          <div className="flex min-w-[220px] flex-1 items-center gap-3">
            <Eye className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-caption text-ink-muted">
                Dibaca <span className="font-bold text-ink">{a.readCount}</span> dari {a.audienceCount} penerima
              </p>
              <div className="mt-1 h-1.5 max-w-[240px] overflow-hidden rounded-full bg-canvas-deep" aria-hidden>
                {readPct > 0 && <div className="h-full rounded-full bg-success" style={{ width: `${readPct}%` }} />}
              </div>
            </div>
          </div>
          {a.readers.length > 0 && (
            <div className="flex items-center gap-2" title={a.readers.map((r) => r.name).join(', ')}>
              <AvatarStack users={a.readers} max={6} size="sm" />
            </div>
          )}
          <span className="inline-flex items-center gap-1.5 text-caption font-semibold text-ink-muted">
            <MessageSquare className="h-4 w-4 text-ink-subtle" aria-hidden />
            {a.commentCount} komentar
          </span>
        </footer>
      </div>

      <Comments announcementId={a.id} />

      {editing && <ComposerModal open editing={a} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        open={confirming}
        title="Hapus pengumuman?"
        description="Pengumuman beserta semua komentarnya akan dihapus untuk semua penerima."
        confirmLabel="Hapus"
        destructive
        loading={remove.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() =>
          remove.mutate(a.id, {
            onSuccess: () => {
              setConfirming(false);
              onDeleted();
            },
          })
        }
      />
    </article>
  );
}

// ─── Comments ─────────────────────────────────────────────────────────

function Comments({ announcementId }: { announcementId: string }) {
  const comments = useAnnouncementComments(announcementId);
  const { add } = useAnnouncementCommentMutations(announcementId);
  const me = useCurrentUser();
  const [draft, setDraft] = useState('');
  const visible = (comments.data ?? []).filter((c) => !c.deletedAt);

  const submit = () => {
    const body = draft.trim();
    if (!body || add.isPending) return;
    add.mutate({ body }, { onSuccess: () => setDraft('') });
  };

  return (
    <section className="rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle">
      <header className="flex items-center justify-between border-b border-line-subtle px-6 py-4">
        <h2 className="text-[0.9375rem] font-bold text-ink">Komentar</h2>
        <span className="inline-flex h-[22px] items-center rounded-full bg-brand px-2.5 text-[11px] font-bold tabular-nums text-white">
          {visible.length}
        </span>
      </header>

      {comments.isPending ? (
        <div className="space-y-3 p-6">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : visible.length === 0 ? (
        <p className="px-6 py-8 text-center text-[0.8125rem] text-ink-subtle">Belum ada komentar. Jadilah yang pertama menanggapi.</p>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {visible.map((c) => (
            <CommentItem key={c.id} comment={c} announcementId={announcementId} />
          ))}
        </ul>
      )}

      <div className="flex items-start gap-3 rounded-b-2xl border-t border-line-subtle bg-canvas/60 px-6 py-4">
        <Avatar user={me} size="md" className="mt-1" />
        <div className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3.5 py-2.5 transition-[border-color,box-shadow] focus-within:border-line-focus focus-within:ring-2 focus-within:ring-brand-subtle">
          <MentionTextarea
            chat
            bare
            formatting
            value={draft}
            onChange={(v) => setDraft(v.slice(0, 4000))}
            members={[]}
            onMention={() => undefined}
            onSubmit={submit}
            placeholder="Tulis komentar… (Enter kirim, Shift+Enter baris baru)"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim() || add.isPending}
          aria-label="Kirim komentar"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-canvas-deep disabled:text-ink-subtle"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function CommentItem({ comment, announcementId }: { comment: AnnouncementCommentDTO; announcementId: string }) {
  const me = useCurrentUser();
  const { edit, remove } = useAnnouncementCommentMutations(announcementId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const mine = comment.author.id === me.id;

  const save = () => {
    const body = draft.trim();
    if (!body) return;
    edit.mutate({ id: comment.id, body }, { onSuccess: () => setEditing(false) });
  };

  return (
    <li className="group flex gap-3 px-6 py-4">
      <Avatar user={comment.author} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[0.8125rem] font-semibold text-ink">{comment.author.name}</span>
          <time className="text-caption text-ink-subtle" dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)}>
            {formatRelative(comment.createdAt)}
          </time>
          {comment.editedAt && <span className="text-caption text-ink-subtle">· diedit</span>}
          {mine && !editing && (
            <span className="ml-auto flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button
                type="button"
                aria-label="Ubah komentar"
                onClick={() => (setDraft(comment.body), setEditing(true))}
                className="rounded-md p-1 text-ink-subtle hover:bg-canvas-deep hover:text-ink"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Hapus komentar"
                onClick={() => remove.mutate(comment.id)}
                className="rounded-md p-1 text-ink-subtle hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-2 space-y-2">
            <MentionTextarea
              chat
              formatting
              autoFocus
              value={draft}
              onChange={setDraft}
              members={[]}
              onMention={() => undefined}
              onSubmit={save}
              onEscape={() => setEditing(false)}
            />
            <div className="flex gap-2">
              <Button size="sm" loading={edit.isPending} disabled={!draft.trim()} onClick={save}>
                Simpan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Batal
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 text-[0.875rem] leading-[1.6] text-ink">
            <RichText body={comment.body} mentions={[]} />
          </div>
        )}
      </div>
    </li>
  );
}
