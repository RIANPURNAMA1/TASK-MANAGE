import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Archive, ArchiveRestore, CheckCircle2, Circle, FileText, Link2, MoreHorizontal } from 'lucide-react';
import type { CardDetail } from '@nexus/shared';
import { CloseButton, ErrorState, Menu, MenuItem, MenuSeparator, Modal, Skeleton } from '../../components/ui';
import { ProjectGlyph } from '../../components/layout/ProjectSidebar';
import { useBoardQuery } from '../board/hooks';
import { columnAccent } from '../board/KanbanColumn';
import { ActivityList } from './ActivityList';
import { AttachmentsSection } from './Attachments';
import { CardSection, SolidLabel } from './CardSection';
import { CardSidebar } from './CardSidebar';
import { ChecklistSection } from './ChecklistSection';
import { CommentsSection } from './Comments';
import { DescriptionEditor } from './DescriptionEditor';
import { useAttachmentMutations, useCardActivity, useCardMutations, useCardQuery } from './hooks';
import { useCardModal } from './useCardModal';

/** Deep-linkable card detail (`?card=<id>`), mounted once in the app shell. */
export function CardModal() {
  const { cardId, close } = useCardModal();
  const card = useCardQuery(cardId);

  return (
    <Modal open={Boolean(cardId)} onClose={close} size="full" bare>
      {card.isPending ? (
        <CardSkeleton onClose={close} />
      ) : card.isError ? (
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center justify-end border-b border-line px-4">
            <CloseButton onClick={close} />
          </div>
          <div className="mx-auto w-full max-w-xl p-8">
            <ErrorState error={card.error} />
          </div>
        </div>
      ) : (
        <CardContent card={card.data} onClose={close} />
      )}
    </Modal>
  );
}

type FeedTab = 'comments' | 'activity';

function CardContent({ card, onClose }: { card: CardDetail; onClose: () => void }) {
  const board = useBoardQuery(card.projectId);
  const m = useCardMutations(card.id);
  const attachments = useAttachmentMutations(card.projectId, card.id);
  const [tab, setTab] = useState<FeedTab>('comments');
  const activity = useCardActivity(card.id, tab === 'activity');
  const canEdit = card.access.canEdit;
  const members = board.data?.members ?? card.assignees;
  // Comment attachments are shown under their comment, not in the card list.
  const cardAttachments = card.attachments.filter((a) => !a.commentId);
  const done = Boolean(card.completedAt);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
        <CloseButton onClick={onClose} />
        <span className="h-5 w-px bg-line" aria-hidden />
        <nav
          aria-label="Lokasi kartu"
          className="flex min-w-0 items-center gap-2 text-[0.8125rem] font-semibold text-ink-muted"
        >
          <Link
            to={`/projects/${card.project.id}`}
            onClick={onClose}
            className="inline-flex min-w-0 items-center gap-2 hover:text-ink"
          >
            <ProjectGlyph color={card.project.color} className="h-3.5 w-3.5" />
            <span className="truncate">{card.project.name}</span>
          </Link>
          <span className="text-line-strong">/</span>
          <span className="inline-flex shrink-0 items-center gap-1.5">
            <span className={clsx('h-2 w-2 rounded-full', columnAccent(card.list.name))} aria-hidden />
            {card.list.name}
          </span>
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => m.update.mutate({ completed: !done })}
            className={clsx(
              'inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-[0.8125rem] font-bold transition-colors disabled:cursor-not-allowed',
              done
                ? 'bg-success-soft text-success-ink hover:bg-success/15'
                : 'border border-line text-ink-muted hover:border-success/40 hover:text-success-ink',
            )}
          >
            {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            <span className="hidden sm:inline">{done ? 'Selesai' : 'Tandai selesai'}</span>
          </button>
          <CardActions card={card} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto md:grid md:grid-cols-[minmax(0,1fr)_340px] md:overflow-hidden">
        <div className="min-w-0 md:overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-[860px] px-5 pb-12 pt-8 sm:px-10">
            {card.archivedAt && (
              <p className="mb-4 flex items-center gap-2 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[0.8125rem] font-semibold text-warning-ink">
                <Archive className="h-4 w-4" /> Kartu ini diarsipkan dan tidak tampil di board.
                {canEdit && (
                  <button type="button" className="ml-auto underline" onClick={() => m.archive.mutate(false)}>
                    Pulihkan
                  </button>
                )}
              </p>
            )}

            <TitleInput value={card.title} editable={canEdit} onSave={(title) => m.update.mutate({ title })} />

            {card.labels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {card.labels.map((l) => (
                  <SolidLabel key={l.id} label={l} />
                ))}
              </div>
            )}

            <div className="mt-7 space-y-8">
              <CardSection icon={<FileText />} title="Deskripsi">
                <DescriptionEditor
                  value={card.description}
                  editable={canEdit}
                  onSave={(description) => m.update.mutate({ description })}
                />
              </CardSection>

              <ChecklistSection card={card} />

              <AttachmentsSection
                attachments={cardAttachments}
                canEdit={canEdit}
                uploading={attachments.upload.isPending}
                onUpload={(files) => attachments.upload.mutate(files)}
                onRemove={(id) => attachments.remove.mutate(id)}
              />

              <section>
                <div role="tablist" aria-label="Diskusi kartu" className="mb-5 flex gap-6 border-b border-line">
                  <FeedTabButton
                    active={tab === 'comments'}
                    onClick={() => setTab('comments')}
                    count={card.commentCount}
                  >
                    Komentar
                  </FeedTabButton>
                  <FeedTabButton active={tab === 'activity'} onClick={() => setTab('activity')}>
                    Aktivitas
                  </FeedTabButton>
                </div>
                {tab === 'comments' ? (
                  <CommentsSection cardId={card.id} projectId={card.projectId} members={members} canEdit={canEdit} />
                ) : activity.isPending ? (
                  <Skeleton className="h-24" />
                ) : (
                  <ActivityList items={activity.data ?? []} />
                )}
              </section>
            </div>
          </div>
        </div>

        <div className="min-h-0 md:overflow-y-auto scrollbar-thin [&>aside]:min-h-full">
          <CardSidebar card={card} board={board.data} />
        </div>
      </div>
    </div>
  );
}

function FeedTabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        'relative -mb-px inline-flex items-center gap-2 pb-3 text-[0.875rem] transition-colors',
        "after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:content-['']",
        active
          ? 'font-bold text-ink after:bg-brand'
          : 'font-semibold text-ink-muted after:bg-transparent hover:text-ink',
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-canvas-deep px-2 text-[11px] font-bold leading-5 text-ink-muted">{count}</span>
      )}
    </button>
  );
}

function CardActions({ card }: { card: CardDetail }) {
  const m = useCardMutations(card.id);
  const copyLink = async () => {
    const url = `${window.location.origin}/projects/${card.projectId}?card=${card.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Tautan kartu disalin.');
    } catch {
      toast.error('Tidak bisa menyalin tautan.');
    }
  };

  return (
    <Menu
      className="w-52"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label="Aksi kartu"
          className={clsx(
            'flex h-9 w-9 items-center justify-center rounded-xl text-ink-subtle transition-colors hover:bg-canvas-deep hover:text-ink',
            open && 'bg-canvas-deep text-ink',
          )}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={<Link2 />} onSelect={() => (close(), void copyLink())}>
            Salin tautan
          </MenuItem>
          {card.access.canEdit && (
            <>
              <MenuSeparator />
              <MenuItem
                icon={card.archivedAt ? <ArchiveRestore /> : <Archive />}
                danger={!card.archivedAt}
                onSelect={() => (close(), m.archive.mutate(!card.archivedAt))}
              >
                {card.archivedAt ? 'Pulihkan kartu' : 'Arsipkan kartu'}
              </MenuItem>
            </>
          )}
        </>
      )}
    </Menu>
  );
}

function TitleInput({ value, editable, onSave }: { value: string; editable: boolean; onSave: (v: string) => void }) {
  return (
    <textarea
      key={value}
      defaultValue={value}
      readOnly={!editable}
      rows={1}
      aria-label="Judul kartu"
      // Grow with the title so long titles never scroll inside the field.
      ref={(el) => {
        if (el) {
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }
      }}
      onInput={(e) => {
        e.currentTarget.style.height = 'auto';
        e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const next = e.target.value.trim();
        if (next && next !== value) onSave(next);
        else e.target.value = value;
      }}
      className="-mx-2 w-[calc(100%+1rem)] resize-none overflow-hidden rounded-xl border border-transparent bg-transparent px-2 py-1 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink [overflow-wrap:anywhere] hover:bg-canvas focus:border-brand-border focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand-subtle read-only:hover:bg-transparent"
    />
  );
}

function CardSkeleton({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-4 sm:px-6">
        <CloseButton onClick={onClose} />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid flex-1 md:grid-cols-[minmax(0,1fr)_340px]">
        <div className="mx-auto w-full max-w-[860px] space-y-4 px-10 py-8">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-32" />
          <Skeleton className="h-24" />
        </div>
        <div className="space-y-4 border-l border-line bg-canvas p-6">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      </div>
    </div>
  );
}
