import { useRef, useState } from 'react';
import { FileText, MessageSquare, Paperclip, SendHorizontal, X } from 'lucide-react';
import type { CommentDTO, UserSummary } from '@nexus/shared';
import { Avatar, Button, ConfirmDialog, Skeleton } from '../../components/ui';
import { toastError } from '../../lib/errors';
import { formatDateTime, formatRelative } from '../../lib/format';
import { uploadFile } from '../../lib/upload';
import { useAuthStore } from '../../stores/auth';
import { AttachmentItem } from './Attachments';
import { useCommentMutations, useCommentsQuery } from './hooks';
import { MentionText } from './MentionText';
import { MentionTextarea, activeMentionIds } from './MentionTextarea';

interface CommentsProps {
  cardId: string;
  projectId: string;
  members: UserSummary[];
  canEdit: boolean;
}

export function CommentsSection({ cardId, projectId, members, canEdit }: CommentsProps) {
  const comments = useCommentsQuery(cardId);
  const items = comments.data ?? [];

  return (
    <div className="space-y-6">
      {canEdit && <CommentComposer cardId={cardId} projectId={projectId} members={members} />}
      {comments.isPending ? (
        <Skeleton className="h-16" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-6 text-center">
          <MessageSquare className="h-6 w-6 text-line-strong" />
          <p className="text-[0.875rem] font-semibold text-ink-muted">Belum ada komentar</p>
          <p className="text-caption text-ink-subtle">Mulai diskusi atau sebut rekan dengan @nama.</p>
        </div>
      ) : (
        <ul className="space-y-5">
          {items.map((c) => (
            <CommentItem key={c.id} comment={c} cardId={cardId} members={members} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CommentComposer({ cardId, projectId, members }: Omit<CommentsProps, 'canEdit'>) {
  const me = useAuthStore((s) => s.user);
  const { create } = useCommentMutations(cardId);
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<UserSummary[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!body.trim()) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(files.map((f) => uploadFile(projectId, f, cardId)));
      await create.mutateAsync({
        body: body.trim(),
        mentionIds: activeMentionIds(body, picked),
        attachmentIds: uploaded.map((a) => a.id),
      });
      setBody('');
      setPicked([]);
      setFiles([]);
    } catch (error) {
      toastError(error, 'Gagal mengirim komentar.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex gap-3">
      {me && <Avatar user={me} size="md" />}
      <div className="min-w-0 flex-1 rounded-2xl border border-line bg-surface transition-[border-color,box-shadow] focus-within:border-brand-border focus-within:ring-4 focus-within:ring-brand-subtle">
        <div className="px-3.5 pt-3">
          <MentionTextarea
            bare
            value={body}
            onChange={setBody}
            members={members}
            onMention={(u) => setPicked((p) => [...p, u])}
            onSubmit={() => void submit()}
            placeholder="Tulis komentar… ketik @ untuk menyebut anggota"
          />
        </div>
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 px-3.5 pt-2">
            {files.map((f, i) => (
              <li
                key={`${f.name}-${i}`}
                className="inline-flex max-w-[220px] items-center gap-1.5 rounded-lg bg-canvas-deep py-1 pl-2 pr-1 text-caption font-semibold text-ink-muted"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  aria-label={`Batalkan ${f.name}`}
                  onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))}
                  className="rounded p-0.5 hover:bg-line"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between px-2 py-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Lampirkan file"
            title="Lampirkan file"
            className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-canvas-deep hover:text-ink"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              setFiles((fs) => [...fs, ...Array.from(e.target.files ?? [])]);
              e.target.value = '';
            }}
          />
          <div className="flex items-center gap-3">
            <span className="hidden text-caption text-ink-subtle sm:inline">Ctrl + Enter untuk kirim</span>
            <Button
              size="sm"
              className="h-8 rounded-lg"
              loading={uploading}
              disabled={!body.trim()}
              icon={<SendHorizontal className="h-3.5 w-3.5" />}
              onClick={() => void submit()}
            >
              Kirim
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommentItem({ comment, cardId, members }: { comment: CommentDTO; cardId: string; members: UserSummary[] }) {
  const me = useAuthStore((s) => s.user);
  const { update, remove } = useCommentMutations(cardId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [picked, setPicked] = useState<UserSummary[]>(comment.mentions);
  const [confirming, setConfirming] = useState(false);
  const isMine = me?.id === comment.author.id;

  const save = () =>
    update.mutate(
      { id: comment.id, body: draft.trim(), mentionIds: activeMentionIds(draft, picked) },
      { onSuccess: () => setEditing(false) },
    );

  return (
    <li className="group flex gap-3">
      <Avatar user={comment.author} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[0.875rem] font-bold text-ink">{comment.author.name}</span>
          <time className="text-caption text-ink-subtle" dateTime={comment.createdAt} title={formatDateTime(comment.createdAt)}>
            {formatRelative(comment.createdAt)}
            {comment.editedAt && ' · disunting'}
          </time>
          {isMine && !editing && (
            <span className="ml-auto flex gap-3 text-caption font-semibold text-ink-subtle opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
              <button type="button" className="hover:text-ink" onClick={() => setEditing(true)}>
                Sunting
              </button>
              <button type="button" className="hover:text-danger" onClick={() => setConfirming(true)}>
                Hapus
              </button>
            </span>
          )}
        </p>
        {editing ? (
          <div className="mt-1.5 space-y-2">
            <MentionTextarea
              value={draft}
              onChange={setDraft}
              members={members}
              onMention={(u) => setPicked((p) => [...p, u])}
              onSubmit={save}
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" loading={update.isPending} onClick={save}>
                Simpan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Batal
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-canvas-deep px-3.5 py-2.5 text-[0.875rem] leading-relaxed text-ink">
            <MentionText body={comment.body} mentions={comment.mentions} />
          </div>
        )}
        {comment.attachments.length > 0 && (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {comment.attachments.map((a) => (
              <AttachmentItem key={a.id} attachment={a} canEdit={false} compact />
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        title="Hapus komentar?"
        description="Komentar yang dihapus tidak bisa dikembalikan."
        confirmLabel="Hapus"
        destructive
        loading={remove.isPending}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate(comment.id, { onSuccess: () => setConfirming(false) })}
      />
    </li>
  );
}
