import { memo, type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { Archive, CheckCircle2, Circle, CircleCheck, MessageSquare, MoreVertical, Paperclip, RotateCcw, SquareArrowOutUpRight } from 'lucide-react';
import type { CardSummary } from '@nexus/shared';
import { AvatarStack, Menu, MenuItem, MenuSeparator } from '../../components/ui';
import { readableTextOn } from '../../lib/color';
import { useCardMutations } from '../card/hooks';
import { DueMeta, PriorityIcon } from './CardBits';

/**
 * Kanban card: solid label pills, title, description excerpt and subtasks, then a footer
 * with people on the left and activity counters on the right.
 * `placeholder` renders the dashed slot left behind while the card is being dragged.
 */
export const CardTile = memo(function CardTile({
  card,
  placeholder,
  overlay,
  onOpen,
  interactive = false,
  context,
}: {
  card: CardSummary;
  /** Extra line under the title (e.g. project breadcrumb on My Tasks). */
  context?: ReactNode;
  placeholder?: boolean;
  overlay?: boolean;
  onOpen?: (id: string) => void;
  /** Shows the ⋮ menu (not in the drag overlay). */
  interactive?: boolean;
}) {
  const done = Boolean(card.completedAt);
  const hiddenSubtasks = card.checklist.total - card.checklistPreview.length;

  return (
    <article
      className={clsx(
        'relative rounded-2xl border bg-surface transition-[border-color,box-shadow] duration-200',
        placeholder
          ? 'border-2 border-dashed border-line-strong bg-transparent [&>*]:invisible'
          : overlay
            ? 'rotate-[2deg] border-line shadow-[0_20px_40px_-12px_rgba(15,23,42,0.25)]'
            : 'border-transparent shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-line hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)]',
      )}
    >
      <div className="px-4 pb-3.5 pt-4">
        {interactive && onOpen && <CardMenu card={card} onOpen={onOpen} />}

        {card.labels.length > 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5 pr-7">
            {card.labels.map((l) => (
              <span
                key={l.id}
                className="inline-flex h-[22px] max-w-[150px] items-center rounded-full px-2.5 text-[11px] font-bold"
                style={{ backgroundColor: l.color, color: readableTextOn(l.color) }}
              >
                <span className="truncate">{l.name}</span>
              </span>
            ))}
          </div>
        )}

        <h4
          className={clsx(
            'flex items-start gap-1.5 text-[0.875rem] font-semibold leading-snug',
            card.labels.length === 0 && 'pr-7',
            done ? 'text-ink-subtle' : 'text-ink',
          )}
        >
          {done && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Selesai" />}
          <span className="line-clamp-3 min-w-0 [overflow-wrap:anywhere]">{card.title}</span>
        </h4>

        {context && <div className="mt-1.5 text-caption text-ink-subtle">{context}</div>}

        {card.excerpt && (
          <p className="mt-1.5 line-clamp-3 text-[0.8125rem] leading-relaxed text-ink-subtle [overflow-wrap:anywhere]">
            {card.excerpt}
          </p>
        )}

        {card.checklistPreview.length > 0 && (
          <ul className="mt-3 space-y-1.5" aria-label={`Subtask ${card.checklist.done} dari ${card.checklist.total} selesai`}>
            {card.checklistPreview.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-[0.8125rem] leading-snug text-ink-muted">
                {item.isDone ? (
                  <CircleCheck className="mt-px h-4 w-4 shrink-0 fill-ink-subtle text-surface" aria-label="Selesai" />
                ) : (
                  <Circle className="mt-px h-4 w-4 shrink-0 text-ink-subtle" aria-label="Belum selesai" />
                )}
                <span className={clsx('min-w-0 [overflow-wrap:anywhere]', item.isDone && 'text-ink-subtle')}>{item.title}</span>
              </li>
            ))}
            {hiddenSubtasks > 0 && (
              <li className="pl-6 text-caption font-semibold text-ink-subtle">+{hiddenSubtasks} subtask lainnya</li>
            )}
          </ul>
        )}
      </div>

      <footer className="flex min-h-[48px] items-center justify-between gap-2 border-t border-line-subtle px-4 py-2.5">
        {card.assignees.length > 0 ? (
          <AvatarStack users={card.assignees} size="md" max={3} />
        ) : (
          <span className="text-caption font-medium text-ink-subtle">Belum ditugaskan</span>
        )}
        <div className="flex items-center gap-3 text-[0.75rem] font-semibold text-ink-subtle">
          <PriorityIcon priority={card.priority} />
          <DueMeta dueDate={card.dueDate} completedAt={card.completedAt} />
          {card.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title={`${card.commentCount} komentar`}>
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              {card.commentCount}
            </span>
          )}
          {card.attachmentCount > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title={`${card.attachmentCount} lampiran`}>
              <Paperclip className="h-3.5 w-3.5" aria-hidden />
              {card.attachmentCount}
            </span>
          )}
        </div>
      </footer>
    </article>
  );
});

/** ⋮ menu. Its items (and their mutation hooks) only mount while the menu is open. */
function CardMenu({ card, onOpen }: { card: CardSummary; onOpen: (id: string) => void }) {
  return (
    <div
      className="absolute right-2.5 top-3"
      // Keep clicks on the menu from opening the card or starting a drag.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Menu
        className="w-52"
        trigger={({ toggle, open }) => (
          <button
            type="button"
            onClick={toggle}
            aria-label={`Aksi untuk ${card.title}`}
            className={clsx(
              'rounded-lg p-1 text-ink-subtle transition-colors hover:bg-canvas-deep hover:text-ink',
              open && 'bg-canvas-deep text-ink',
            )}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        )}
      >
        {(close) => <CardMenuItems card={card} onOpen={onOpen} close={close} />}
      </Menu>
    </div>
  );
}

function CardMenuItems({ card, onOpen, close }: { card: CardSummary; onOpen: (id: string) => void; close: () => void }) {
  const { update, archive } = useCardMutations(card.id);
  const done = Boolean(card.completedAt);
  return (
    <>
      <MenuItem icon={<SquareArrowOutUpRight />} onSelect={() => (close(), onOpen(card.id))}>
        Buka detail
      </MenuItem>
      <MenuItem
        icon={done ? <RotateCcw /> : <CheckCircle2 />}
        onSelect={() => (close(), update.mutate({ completed: !done }))}
      >
        {done ? 'Buka kembali' : 'Tandai selesai'}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Archive />} danger onSelect={() => (close(), archive.mutate(true))}>
        Arsipkan kartu
      </MenuItem>
    </>
  );
}

export function SortableCard({
  card,
  disabled,
  onOpen,
}: {
  card: CardSummary;
  disabled: boolean;
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card' },
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      role="button"
      aria-label={`Buka kartu ${card.title}`}
      onClick={() => onOpen(card.id)}
      onKeyDown={(e) => {
        // Enter opens the card; Space (handled by dnd-kit) picks it up for keyboard dragging.
        if (e.key === 'Enter') onOpen(card.id);
        else listeners?.onKeyDown?.(e);
      }}
      className={clsx('rounded-2xl outline-none', disabled ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing')}
    >
      <CardTile card={card} placeholder={isDragging} onOpen={onOpen} interactive={!disabled} />
    </div>
  );
}

