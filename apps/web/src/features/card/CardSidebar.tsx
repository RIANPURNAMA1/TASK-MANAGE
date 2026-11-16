import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { CalendarDays, Check, ChevronDown, Columns3, Flag, Plus, Tag, UsersRound, X } from 'lucide-react';
import {
  PRIORITIES,
  PRIORITY_LABEL,
  sortByPosition,
  type BoardData,
  type CardDetail,
  type Priority,
} from '@nexus/shared';
import { Avatar, Button, Menu } from '../../components/ui';
import { dueStatus, formatDateTime, formatRelative, fromDateTimeLocal, toDateTimeLocal } from '../../lib/format';
import { PriorityIcon } from '../board/CardBits';
import { useLabelMutations } from '../board/hooks';
import { columnAccent } from '../board/KanbanColumn';
import { SolidLabel } from './CardSection';
import { useCardMutations } from './hooks';
import { PickerPopover } from './PickerPopover';

const LABEL_COLORS = ['#2652A0', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#0EA5E9', '#64748B'];

const toggle = (ids: string[], id: string) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** One "label | value" row of the properties panel. */
function Property({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] items-start gap-2">
      <span className="flex h-9 items-center gap-2 text-[0.8125rem] font-semibold text-ink-subtle [&>svg]:h-4 [&>svg]:w-4">
        {icon}
        {label}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Ghost button that looks like plain text until hovered — the value cell of a property. */
const valueButton =
  'flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-[0.8125rem] font-semibold text-ink transition-colors hover:bg-surface disabled:cursor-default disabled:hover:bg-transparent';

const placeholderText = 'font-medium text-ink-subtle';

export function CardSidebar({ card, board }: { card: CardDetail; board: BoardData | undefined }) {
  const m = useCardMutations(card.id);
  const canEdit = card.access.canEdit;
  const lists = sortByPosition(board?.lists ?? []);
  const members = board?.members ?? card.assignees;
  const labels = board?.labels ?? card.labels;

  const moveToList = (listId: string) => {
    if (listId === card.listId) return;
    const last = sortByPosition((board?.cards ?? []).filter((c) => c.listId === listId && c.id !== card.id)).at(-1);
    m.move.mutate({ listId, prevId: last?.id ?? null });
  };

  return (
    <aside className="flex flex-col border-t border-line bg-canvas md:border-l md:border-t-0">
      <div className="space-y-1 p-5 pt-7">
        <p className="mb-3 px-1 text-caption font-bold uppercase tracking-[0.08em] text-ink-subtle">Properti</p>

        <Property icon={<Columns3 />} label="Kolom">
          <OptionMenu
            disabled={!canEdit}
            value={card.listId}
            onChange={moveToList}
            options={lists.map((l) => ({
              value: l.id,
              label: l.name,
              leading: <span className={clsx('h-2 w-2 rounded-full', columnAccent(l.name))} />,
            }))}
            fallback={card.list.name}
          />
        </Property>

        <Property icon={<UsersRound />} label="Assignee">
          <PickerPopover
            placeholder="Cari anggota…"
            selected={card.assignees.map((a) => a.id)}
            onToggle={(id) => canEdit && m.setAssignees.mutate(toggle(card.assignees.map((a) => a.id), id))}
            options={members.map((u) => ({
              id: u.id,
              label: u.name,
              render: (
                <span className="flex items-center gap-2">
                  <Avatar user={u} size="xs" /> {u.name}
                </span>
              ),
            }))}
            trigger={
              <div className={clsx(valueButton, 'flex-wrap py-1.5')}>
                {card.assignees.length === 0 && <span className={placeholderText}>Tambahkan orang</span>}
                {card.assignees.map((u) => (
                  <span key={u.id} className="inline-flex max-w-full items-center gap-1.5">
                    <Avatar user={u} size="sm" />
                    <span className="truncate">{u.name}</span>
                  </span>
                ))}
              </div>
            }
          />
        </Property>

        <Property icon={<Tag />} label="Label">
          <PickerPopover
            placeholder="Cari label…"
            selected={card.labels.map((l) => l.id)}
            onToggle={(id) => canEdit && m.setLabels.mutate(toggle(card.labels.map((l) => l.id), id))}
            options={labels.map((l) => ({ id: l.id, label: l.name, render: <SolidLabel label={l} /> }))}
            footer={canEdit && <NewLabelForm projectId={card.projectId} />}
            trigger={
              <div className={clsx(valueButton, 'flex-wrap gap-1.5 py-1.5')}>
                {card.labels.length === 0 && <span className={placeholderText}>Tambahkan label</span>}
                {card.labels.map((l) => (
                  <SolidLabel key={l.id} label={l} />
                ))}
              </div>
            }
          />
        </Property>

        <Property icon={<CalendarDays />} label="Mulai">
          <DateField
            label="Tanggal mulai"
            value={card.startDate}
            max={card.dueDate}
            canEdit={canEdit}
            onChange={(startDate) => m.update.mutate({ startDate })}
          />
        </Property>

        <Property icon={<CalendarDays />} label="Tenggat">
          <DateField
            label="Tenggat"
            value={card.dueDate}
            min={card.startDate}
            tone={dueColor[dueStatus(card.dueDate, card.completedAt)]}
            canEdit={canEdit}
            onChange={(dueDate) => m.update.mutate({ dueDate })}
          />
        </Property>

        <Property icon={<Flag />} label="Prioritas">
          <OptionMenu
            disabled={!canEdit}
            value={card.priority}
            onChange={(priority) => m.update.mutate({ priority: priority as Priority })}
            options={PRIORITIES.map((p) => ({
              value: p,
              label: PRIORITY_LABEL[p],
              leading: p === 'NONE' ? <span className="h-3.5 w-3.5 text-center leading-none text-ink-subtle">–</span> : <PriorityIcon priority={p} />,
            }))}
          />
        </Property>
      </div>

      <div className="mt-auto space-y-3 border-t border-line px-6 py-5 text-[0.8125rem]">
        <div className="flex items-center gap-2.5">
          <Avatar user={card.createdBy} size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold text-ink">{card.createdBy.name}</p>
            <p className="text-caption text-ink-subtle" title={formatDateTime(card.createdAt)}>
              Membuat kartu ini {formatRelative(card.createdAt)}
            </p>
          </div>
        </div>
        <p className="text-caption text-ink-subtle">Diperbarui {formatRelative(card.updatedAt)}</p>
      </div>
    </aside>
  );
}

interface Option {
  value: string;
  label: string;
  leading?: ReactNode;
}

/** Single-select dropdown styled as a property value. */
function OptionMenu({
  value,
  options,
  onChange,
  disabled,
  fallback,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown when `value` is not among the options (e.g. an archived column). */
  fallback?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Menu
      align="left"
      className="w-56"
      trigger={({ toggle: open }) => (
        <button type="button" disabled={disabled} onClick={open} className={clsx(valueButton, 'group')}>
          {current?.leading}
          <span className="min-w-0 flex-1 truncate">{current?.label ?? fallback ?? '—'}</span>
          {!disabled && <ChevronDown className="h-3.5 w-3.5 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100" />}
        </button>
      )}
    >
      {(close) =>
        options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="menuitemradio"
            aria-checked={o.value === value}
            onClick={() => {
              close();
              onChange(o.value);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-body font-semibold text-ink hover:bg-canvas-deep"
          >
            <span className="flex w-4 justify-center">{o.leading}</span>
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.value === value && <Check className="h-4 w-4 text-brand" />}
          </button>
        ))
      }
    </Menu>
  );
}

const dueColor = {
  none: 'text-ink',
  done: 'text-success-ink',
  overdue: 'text-danger-ink',
  today: 'text-warning-ink',
  soon: 'text-ink',
  later: 'text-ink',
} as const;

/** Native datetime picker for reliability, styled as a property value; with a clear button. */
/** Date-time property (start / due). The browser enforces `min`/`max`; the server re-checks the order. */
function DateField({
  label,
  value,
  min,
  max,
  tone,
  canEdit,
  onChange,
}: {
  label: string;
  value: string | null;
  /** Earliest / latest allowed value (the other end of the range), if set. */
  min?: string | null;
  max?: string | null;
  /** Text color class; defaults to the muted style. */
  tone?: string;
  canEdit: boolean;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className={clsx(valueButton, 'group gap-1 pr-1 focus-within:bg-surface')}>
      <input
        type="datetime-local"
        aria-label={label}
        disabled={!canEdit}
        defaultValue={toDateTimeLocal(value)}
        min={min ? toDateTimeLocal(min) : undefined}
        max={max ? toDateTimeLocal(max) : undefined}
        key={value ?? 'none'}
        onBlur={(e) => {
          const next = fromDateTimeLocal(e.target.value);
          if (next !== value) onChange(next);
        }}
        className={clsx(
          'min-w-0 flex-1 bg-transparent text-[0.8125rem] font-semibold outline-none [color-scheme:light]',
          value ? (tone ?? 'text-ink') : 'text-ink-subtle',
        )}
      />
      {canEdit && value && (
        <button
          type="button"
          aria-label={`Hapus ${label.toLowerCase()}`}
          onClick={() => onChange(null)}
          className="rounded-md p-1 text-ink-subtle opacity-0 transition-opacity hover:bg-canvas-deep hover:text-ink group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function NewLabelForm({ projectId }: { projectId: string }) {
  const { create } = useLabelMutations(projectId);
  const [name, setName] = useState('');
  const [color, setColor] = useState(LABEL_COLORS[0]!);

  const submit = () => {
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), color }, { onSuccess: () => setName('') });
  };

  return (
    <div className="space-y-2 p-1.5">
      <p className="text-caption font-bold uppercase tracking-[0.06em] text-ink-subtle">Label baru</p>
      <div className="flex gap-1.5">
        {LABEL_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Warna ${c}`}
            aria-pressed={c === color}
            onClick={() => setColor(c)}
            className="h-5 w-5 rounded-full ring-offset-2 transition-shadow"
            style={{ backgroundColor: c, boxShadow: c === color ? `0 0 0 2px #fff, 0 0 0 4px ${c}` : undefined }}
          />
        ))}
      </div>
      <div className="flex gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Nama label"
          aria-label="Nama label baru"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line px-2.5 text-body outline-none focus:border-brand-border focus:ring-2 focus:ring-brand-subtle"
        />
        <Button size="icon" aria-label="Buat label" loading={create.isPending} onClick={submit} className="h-8 w-8">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
