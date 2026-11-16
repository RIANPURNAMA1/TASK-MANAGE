import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bold, Code, Italic, List, ListOrdered, Lock, Paperclip, Send, Strikethrough, TextQuote, X } from 'lucide-react';
import type { AttachmentDTO, ChannelDetail, MessageDTO, UserSummary } from '@nexus/shared';
import { MESSAGE_MAX_LENGTH } from '@nexus/shared';
import { Spinner } from '../../components/ui';
import { plainText, type FormatKind } from '../../lib/chatMarkdown';
import { errorMessage } from '../../lib/errors';
import { uploadFile } from '../../lib/upload';
import { MentionTextarea, activeMentionIds, type MentionTextareaHandle } from '../card/MentionTextarea';
import { useSendMessage, useTypingEmitter } from './hooks';

interface Upload {
  key: string;
  name: string;
  status: 'uploading' | 'done' | 'error';
  attachment?: AttachmentDTO;
  error?: string;
}

interface ComposerProps {
  channel: ChannelDetail;
  members: UserSummary[];
  replyTo: MessageDTO | null;
  onCancelReply: () => void;
}

export function Composer({ channel, members, replyTo, onCancelReply }: ComposerProps) {
  const [body, setBody] = useState('');
  const [picked, setPicked] = useState<UserSummary[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const inputRef = useRef<MentionTextareaHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { send } = useSendMessage();
  const emitTyping = useTypingEmitter(channel.id);

  // Attachments live in the project's storage, so DMs cannot carry files (FR-31 vs FR-32).
  const projectId = channel.type === 'PROJECT' ? channel.project?.id : undefined;
  const busy = uploads.some((u) => u.status === 'uploading');
  const ready = uploads.filter((u) => u.status === 'done' && u.attachment).map((u) => u.attachment!);
  const canSend = !busy && (body.trim().length > 0 || ready.length > 0);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  if (!channel.canPost) {
    return (
      <p className="mx-5 mb-4 flex items-center gap-2 rounded-lg bg-canvas-deep px-3 py-2.5 text-ink-muted">
        <Lock className="h-4 w-4" />
        {channel.type === 'DIRECT'
          ? 'Pengguna ini sudah tidak aktif. Anda hanya bisa membaca percakapan.'
          : 'Anda hanya bisa membaca chat ini. Gabung ke proyek untuk mengirim pesan.'}
      </p>
    );
  }

  const attach = (files: File[]) => {
    if (!projectId) return;
    for (const file of files) {
      const key = crypto.randomUUID();
      setUploads((u) => [...u, { key, name: file.name, status: 'uploading' }]);
      uploadFile(projectId, file)
        .then((attachment) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: 'done', attachment } : x))))
        .catch((error: unknown) =>
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: 'error', error: errorMessage(error) } : x))),
        );
    }
  };

  const submit = () => {
    if (!canSend) return;
    const text = body.trim();
    send({
      channelId: channel.id,
      input: {
        clientMessageId: crypto.randomUUID(),
        body: text,
        replyToId: replyTo?.id ?? null,
        mentionIds: activeMentionIds(text, picked),
        attachmentIds: ready.map((a) => a.id),
      },
      replyTo: replyTo
        ? { id: replyTo.id, authorName: replyTo.author.name, body: replyTo.body, deleted: replyTo.deletedAt !== null }
        : null,
      attachments: ready,
      status: 'sending',
      createdAt: new Date().toISOString(),
    });
    setBody('');
    setPicked([]);
    setUploads([]);
    onCancelReply();
  };

  return (
    <div className="w-full shrink-0 px-4 pb-4 sm:px-6">
      {replyTo && (
        <div className="mb-2 flex items-start gap-2 rounded-xl border-l-[3px] border-brand bg-surface px-3 py-2 shadow-card">
          <div className="min-w-0 flex-1 text-caption">
            <p className="font-semibold text-brand-strong">Membalas {replyTo.author.name}</p>
            <p className="truncate text-ink-muted">{plainText(replyTo.body) || '📎 Lampiran'}</p>
          </div>
          <button type="button" aria-label="Batalkan balasan" onClick={onCancelReply} className="rounded p-0.5 text-ink-subtle hover:text-ink">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {uploads.map((u) => (
            <li
              key={u.key}
              title={u.error}
              className={`inline-flex max-w-[220px] items-center gap-1.5 rounded-full px-2.5 py-1 text-caption ${
                u.status === 'error' ? 'bg-danger-soft text-danger-ink' : 'bg-canvas-deep text-ink-muted'
              }`}
            >
              {u.status === 'uploading' && <Spinner className="h-3 w-3 text-brand" />}
              <span className="truncate">{u.status === 'error' ? `Gagal: ${u.name}` : u.name}</span>
              <button
                type="button"
                aria-label={`Hapus ${u.name}`}
                onClick={() => setUploads((list) => list.filter((x) => x.key !== u.key))}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-2xl border border-line bg-surface shadow-card transition-[border-color,box-shadow] focus-within:border-line-focus focus-within:ring-2 focus-within:ring-brand-subtle">
        <div className="px-3.5 pb-1 pt-3">
          <MentionTextarea
            ref={inputRef}
            chat
            bare
            formatting
            value={body}
            onChange={(value) => {
              setBody(value.slice(0, MESSAGE_MAX_LENGTH));
              if (value.trim()) emitTyping();
            }}
            members={members}
            onMention={(u) => setPicked((p) => [...p, u])}
            onSubmit={submit}
            onEscape={replyTo ? onCancelReply : undefined}
            onPasteFiles={projectId ? attach : undefined}
            placeholder={`Kirim pesan ke ${channel.type === 'PROJECT' ? `#${channel.name}` : channel.name}… (@ untuk menyebut)`}
          />
        </div>

        <div className="flex items-center gap-0.5 px-2 pb-2">
          <FormatToolbar onFormat={(kind) => inputRef.current?.format(kind)} />
          {projectId && (
            <>
              <span className="mx-1 h-5 w-px bg-line" aria-hidden />
              <ToolButton label="Lampirkan file" onClick={() => fileRef.current?.click()}>
                <Paperclip />
              </ToolButton>
              <input
                ref={fileRef}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  attach(Array.from(e.target.files ?? []));
                  e.target.value = '';
                }}
              />
            </>
          )}
          <span className="ml-auto hidden pr-2 text-caption text-ink-subtle md:block">
            <kbd className="font-sans font-semibold">Enter</kbd> kirim · <kbd className="font-sans font-semibold">Shift+Enter</kbd> baris baru
          </span>
          <button
            type="button"
            aria-label="Kirim pesan"
            title="Kirim (Enter)"
            disabled={!canSend}
            onClick={submit}
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-canvas-deep disabled:text-ink-subtle md:ml-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

const FORMATS: { kind: FormatKind; label: string; icon: ReactNode }[] = [
  { kind: 'bold', label: 'Tebal (Ctrl+B)', icon: <Bold /> },
  { kind: 'italic', label: 'Miring (Ctrl+I)', icon: <Italic /> },
  { kind: 'strike', label: 'Coret (Ctrl+Shift+X)', icon: <Strikethrough /> },
  { kind: 'code', label: 'Kode (Ctrl+E)', icon: <Code /> },
  { kind: 'ul', label: 'Daftar berpoin', icon: <List /> },
  { kind: 'ol', label: 'Daftar bernomor', icon: <ListOrdered /> },
  { kind: 'quote', label: 'Kutipan', icon: <TextQuote /> },
];

function FormatToolbar({ onFormat }: { onFormat: (kind: FormatKind) => void }) {
  return (
    <div role="toolbar" aria-label="Format teks" className="flex items-center gap-0.5">
      {FORMATS.map((f, i) => (
        <span key={f.kind} className="contents">
          {i === 4 && <span className="mx-1 h-5 w-px bg-line" aria-hidden />}
          <ToolButton label={f.label} onClick={() => onFormat(f.kind)}>
            {f.icon}
          </ToolButton>
        </span>
      ))}
    </div>
  );
}

function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Keep focus (and the selection) in the textarea.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-canvas-deep hover:text-ink [&>svg]:h-4 [&>svg]:w-4"
    >
      {children}
    </button>
  );
}
