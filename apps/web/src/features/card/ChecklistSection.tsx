import { useState } from 'react';
import clsx from 'clsx';
import { Circle, CircleCheck, ListChecks, Trash2 } from 'lucide-react';
import { sortByPosition, type CardDetail, type ChecklistItemDTO } from '@nexus/shared';
import { InlineComposer } from '../board/InlineComposer';
import { CardSection } from './CardSection';
import { useChecklistMutations } from './hooks';

export function ChecklistSection({ card }: { card: CardDetail }) {
  const m = useChecklistMutations(card.id);
  const items = sortByPosition(card.checklistItems);
  const done = items.filter((i) => i.isDone).length;
  const canEdit = card.access.canEdit;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  if (!canEdit && items.length === 0) return null;

  return (
    <CardSection icon={<ListChecks />} title="Subtask" meta={items.length > 0 ? `${done}/${items.length}` : undefined}>
      {items.length > 0 && (
        <div className="mb-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-deep">
            <div
              className={clsx('h-full rounded-full transition-[width] duration-300', pct === 100 ? 'bg-success' : 'bg-brand')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-9 text-right text-caption font-bold tabular-nums text-ink-subtle">{pct}%</span>
        </div>
      )}

      <ul className="space-y-0.5">
        {items.map((item) => (
          <ChecklistRow
            key={item.id}
            item={item}
            canEdit={canEdit}
            onToggle={() => m.update.mutate({ id: item.id, isDone: !item.isDone })}
            onRename={(title) => m.update.mutate({ id: item.id, title })}
            onDelete={() => m.remove.mutate(item.id)}
          />
        ))}
      </ul>

      {canEdit && (
        <div className="mt-1">
          <InlineComposer
            label="Tambah subtask"
            placeholder="Apa yang perlu dikerjakan?"
            submitLabel="Tambah"
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[0.875rem] font-semibold text-ink-subtle transition-colors hover:bg-canvas hover:text-ink"
            onSubmit={(t) => m.create.mutateAsync(t)}
          />
        </div>
      )}
    </CardSection>
  );
}

function ChecklistRow({
  item,
  canEdit,
  onToggle,
  onRename,
  onDelete,
}: {
  item: ChecklistItemDTO;
  canEdit: boolean;
  onToggle: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);

  const save = (value: string) => {
    setEditing(false);
    const title = value.trim();
    if (title && title !== item.title) onRename(title);
  };

  return (
    <li className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-canvas">
      <button
        type="button"
        role="checkbox"
        aria-checked={item.isDone}
        aria-label={item.title}
        disabled={!canEdit}
        onClick={onToggle}
        className="mt-px shrink-0 rounded-full text-ink-subtle transition-colors hover:text-success disabled:hover:text-ink-subtle"
      >
        {item.isDone ? (
          <CircleCheck className="h-[18px] w-[18px] fill-success text-surface" />
        ) : (
          <Circle className="h-[18px] w-[18px]" />
        )}
      </button>

      {editing ? (
        <input
          autoFocus
          defaultValue={item.title}
          aria-label="Ubah subtask"
          onBlur={(e) => save(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save(e.currentTarget.value);
            if (e.key === 'Escape') setEditing(false);
          }}
          className="-my-0.5 h-7 min-w-0 flex-1 rounded-md border border-brand-border bg-surface px-2 text-[0.875rem] outline-none ring-2 ring-brand-subtle"
        />
      ) : (
        <span
          onClick={() => canEdit && setEditing(true)}
          className={clsx(
            'min-w-0 flex-1 text-[0.875rem] leading-snug [overflow-wrap:anywhere]',
            item.isDone ? 'text-ink-subtle line-through decoration-ink-subtle/40' : 'text-ink',
            canEdit && 'cursor-text',
          )}
        >
          {item.title}
        </span>
      )}

      {canEdit && !editing && (
        <button
          type="button"
          aria-label={`Hapus ${item.title}`}
          onClick={onDelete}
          className="rounded-md p-0.5 text-ink-subtle opacity-0 transition-opacity hover:text-danger focus:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}
