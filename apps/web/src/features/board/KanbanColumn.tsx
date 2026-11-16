import { useState } from 'react';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import clsx from 'clsx';
import { Archive, MoreVertical, Pencil, Plus } from 'lucide-react';
import type { CardSummary, ListDTO } from '@nexus/shared';
import { Menu, MenuItem } from '../../components/ui';
import { useArchiveList, useCreateCard, useRenameList } from './hooks';
import { InlineComposer } from './InlineComposer';
import { SortableCard } from './KanbanCard';
import { listDndId } from './useKanbanDnd';

export const COLUMN_WIDTH = 'w-[300px]';

/** Status dot inferred from common column names; custom columns stay neutral. */
export function columnAccent(name: string): string {
  if (/done|selesai|complete|closed/i.test(name)) return 'bg-success';
  if (/progress|doing|berjalan|dikerjakan|proses/i.test(name)) return 'bg-brand';
  if (/review|qa|test|uji|cek/i.test(name)) return 'bg-warning';
  if (/block|tertahan|hold/i.test(name)) return 'bg-danger';
  if (/to ?do|request|backlog|baru/i.test(name)) return 'bg-danger';
  return 'bg-ink-subtle';
}

interface KanbanColumnProps {
  list: ListDTO;
  cards: CardSummary[];
  canEdit: boolean;
  dndDisabled: boolean;
  onOpenCard: (id: string) => void;
}

export function KanbanColumn({ list, cards, canEdit, dndDisabled, onOpenCard }: KanbanColumnProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: listDndId(list.id),
    data: { type: 'list' },
    disabled: !canEdit,
  });
  const createCard = useCreateCard(list.projectId);
  const [renaming, setRenaming] = useState(false);
  const [composing, setComposing] = useState(false);

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={`Kolom ${list.name}`}
      className={clsx('flex shrink-0 flex-col', COLUMN_WIDTH, isDragging && 'opacity-40')}
    >
      <header
        {...attributes}
        {...listeners}
        className={clsx('flex h-10 items-center gap-2.5 px-1', canEdit && 'cursor-grab active:cursor-grabbing')}
      >
        <span className={clsx('h-2 w-2 shrink-0 rounded-full', columnAccent(list.name))} aria-hidden />
        <ColumnTitle list={list} editing={renaming} onEditingChange={canEdit ? setRenaming : undefined} />
        <span className="text-[0.9375rem] font-medium tabular-nums text-ink-subtle">{cards.length}</span>
        {canEdit && (
          <div className="ml-auto" onPointerDown={(e) => e.stopPropagation()}>
            <ColumnMenu list={list} onRename={() => setRenaming(true)} />
          </div>
        )}
      </header>

      <div className="mt-2 flex flex-col gap-3">
        {canEdit && (
          <InlineComposer
            label="Tambah kartu"
            hideLabel
            icon={<Plus className="h-5 w-5" />}
            placeholder="Judul kartu…"
            submitLabel="Tambah"
            multiline
            open={composing}
            onOpenChange={setComposing}
            className="flex h-11 w-full items-center justify-center rounded-2xl bg-surface text-ink-muted shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:text-brand"
            onSubmit={(title) => createCard.mutateAsync({ listId: list.id, title, beforeId: cards[0]?.id ?? null })}
          />
        )}

        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} disabled={dndDisabled} onOpen={onOpenCard} />
          ))}
        </SortableContext>

        {cards.length === 0 && (
          // Also keeps an empty column tall enough to drop cards into.
          <div className="flex h-24 items-center justify-center rounded-2xl border-2 border-dashed border-line text-caption font-semibold text-ink-subtle">
            Belum ada kartu
          </div>
        )}
      </div>
    </section>
  );
}

function ColumnTitle({
  list,
  editing,
  onEditingChange,
}: {
  list: ListDTO;
  editing: boolean;
  /** Undefined when the viewer cannot rename. */
  onEditingChange?: (editing: boolean) => void;
}) {
  const rename = useRenameList();
  const setEditing = (value: boolean) => onEditingChange?.(value);

  if (!editing) {
    return (
      <h3
        className="min-w-0 truncate text-[0.9375rem] font-semibold text-ink"
        onDoubleClick={() => setEditing(true)}
        title={list.name}
      >
        {list.name}
      </h3>
    );
  }

  const save = (value: string) => {
    setEditing(false);
    const name = value.trim();
    if (name && name !== list.name) rename.mutate({ id: list.id, name });
  };

  return (
    <input
      autoFocus
      defaultValue={list.name}
      aria-label="Nama kolom"
      onPointerDown={(e) => e.stopPropagation()}
      onBlur={(e) => save(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') save(e.currentTarget.value);
        if (e.key === 'Escape') setEditing(false);
      }}
      className="min-w-0 flex-1 rounded-md border border-line-focus bg-surface px-1.5 py-0.5 text-[0.9375rem] font-semibold outline-none"
    />
  );
}

function ColumnMenu({ list, onRename }: { list: ListDTO; onRename: () => void }) {
  const archive = useArchiveList(list.projectId);
  return (
    <Menu
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Menu kolom ${list.name}`}
          className="rounded-lg p-1 text-ink-subtle transition-colors hover:bg-surface hover:text-ink"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={<Pencil />}
            onSelect={() => {
              close();
              onRename();
            }}
          >
            Ubah nama
          </MenuItem>
          <MenuItem
            icon={<Archive />}
            danger
            onSelect={() => {
              close();
              archive.mutate(list);
            }}
          >
            Arsipkan kolom
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
