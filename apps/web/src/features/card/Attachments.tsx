import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Download, Eye, Paperclip, Trash2, Upload, UploadCloud } from 'lucide-react';
import { formatBytes, type AttachmentDTO } from '@nexus/shared';
import { Button, Modal, Spinner } from '../../components/ui';
import { platform } from '@nexus/platform';
import { api } from '../../lib/api';
import { resolveApiUrl } from '../../lib/apiBase';
import { toastError } from '../../lib/errors';
import { formatRelative } from '../../lib/format';
import { useAuthStore } from '../../stores/auth';
import { CardSection } from './CardSection';
import { useSignedUrl } from './hooks';

/** Card-level attachment list with drag-and-drop upload (FR-27) and preview (FR-28). */
export function AttachmentsSection({
  attachments,
  canEdit,
  uploading,
  onUpload,
  onRemove,
}: {
  attachments: AttachmentDTO[];
  canEdit: boolean;
  uploading: boolean;
  onUpload: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  if (!canEdit && attachments.length === 0) return null;

  const pick = () => inputRef.current?.click();
  const dropProps = canEdit
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length) onUpload(files);
        },
      }
    : {};

  return (
    <CardSection
      icon={<Paperclip />}
      title="Lampiran"
      meta={attachments.length > 0 ? attachments.length : undefined}
      actions={
        canEdit &&
        attachments.length > 0 && (
          <Button size="sm" variant="ghost" loading={uploading} icon={<Upload className="h-3.5 w-3.5" />} onClick={pick}>
            Unggah
          </Button>
        )
      }
    >
      <div {...dropProps} className={clsx('rounded-2xl transition-colors', dragging && 'bg-brand-soft ring-2 ring-brand-border')}>
        {attachments.length === 0 ? (
          <button
            type="button"
            onClick={pick}
            disabled={uploading}
            className="flex w-full flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line px-4 py-6 text-center transition-colors hover:border-brand-border hover:bg-brand-soft/50"
          >
            {uploading ? (
              <Spinner className="h-5 w-5 text-brand" />
            ) : (
              <UploadCloud className="h-6 w-6 text-ink-subtle" />
            )}
            <span className="text-[0.875rem] font-semibold text-ink">
              {uploading ? 'Mengunggah…' : 'Seret file ke sini atau klik untuk mengunggah'}
            </span>
            <span className="text-caption text-ink-subtle">Gambar & PDF bisa dipratinjau · maks. 100 MB</span>
          </button>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {attachments.map((a) => (
              <AttachmentItem key={a.id} attachment={a} canEdit={canEdit} onRemove={() => onRemove(a.id)} />
            ))}
          </ul>
        )}
      </div>
      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onUpload(files);
            e.target.value = '';
          }}
        />
      )}
    </CardSection>
  );
}

const extensionOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.slice(0, 4).toUpperCase() : 'FILE');

export function AttachmentItem({
  attachment,
  canEdit,
  onRemove,
  compact,
}: {
  attachment: AttachmentDTO;
  canEdit: boolean;
  onRemove?: () => void;
  compact?: boolean;
}) {
  const me = useAuthStore((s) => s.user);
  const [previewing, setPreviewing] = useState(false);
  const isImage = attachment.mimeType.startsWith('image/');
  const thumb = useSignedUrl(attachment.id, 'inline', isImage && !compact);
  const canRemove = canEdit && onRemove && (me?.id === attachment.uploader.id || me?.orgRole === 'OWNER' || me?.orgRole === 'ADMIN');

  const download = async () => {
    try {
      const { url } = await api.attachments.signedUrl(attachment.id, 'attachment');
      // Desktop hands downloads to the system browser instead of navigating the app window.
      if (platform.kind === 'desktop') platform.openExternal(resolveApiUrl(url));
      else window.location.assign(url);
    } catch (error) {
      toastError(error, 'Gagal mengunduh file.');
    }
  };

  return (
    <li className="group flex items-center gap-3 rounded-xl border border-line bg-surface p-2 pr-1.5 transition-colors hover:border-line-strong">
      <button
        type="button"
        onClick={() => (attachment.previewable ? setPreviewing(true) : void download())}
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-canvas-deep text-[10px] font-extrabold tracking-wide text-ink-muted"
        aria-label={`Buka ${attachment.fileName}`}
      >
        {isImage && thumb.data ? (
          <img src={thumb.data.url} alt="" className="h-full w-full object-cover" />
        ) : (
          extensionOf(attachment.fileName)
        )}
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-semibold text-ink" title={attachment.fileName}>
          {attachment.fileName}
        </p>
        <p className="text-caption text-ink-subtle">
          {formatBytes(attachment.size)} · {formatRelative(attachment.createdAt)}
        </p>
      </div>
      <div className="flex gap-0.5 opacity-60 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {attachment.previewable && (
          <IconButton label="Pratinjau" onClick={() => setPreviewing(true)}>
            <Eye className="h-3.5 w-3.5" />
          </IconButton>
        )}
        <IconButton label="Unduh" onClick={() => void download()}>
          <Download className="h-3.5 w-3.5" />
        </IconButton>
        {canRemove && (
          <IconButton label="Hapus" onClick={onRemove!} danger>
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>
      {previewing && <PreviewModal attachment={attachment} onClose={() => setPreviewing(false)} />}
    </li>
  );
}

function IconButton({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`rounded-md p-1.5 text-ink-subtle hover:bg-canvas-deep ${danger ? 'hover:text-danger' : 'hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function PreviewModal({ attachment, onClose }: { attachment: AttachmentDTO; onClose: () => void }) {
  const signed = useSignedUrl(attachment.id, 'inline');
  const isImage = attachment.mimeType.startsWith('image/');
  return (
    <Modal open onClose={onClose} title={attachment.fileName} size="xl">
      <div className="flex min-h-[320px] items-center justify-center rounded-lg bg-canvas-deep">
        {!signed.data ? (
          <Spinner />
        ) : isImage ? (
          <img src={signed.data.url} alt={attachment.fileName} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
        ) : (
          <iframe src={signed.data.url} title={attachment.fileName} className="h-[70vh] w-full rounded-lg" />
        )}
      </div>
    </Modal>
  );
}
