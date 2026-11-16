import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, ChevronsUpDown, Circle, CircleCheck, MessageSquare, Paperclip } from 'lucide-react';
import { PRIORITIES, PRIORITY_LABEL, comparePosition, type CardSummary, type ListDTO } from '@nexus/shared';
import { AvatarStack, EmptyState } from '../../components/ui';
import { readableTextOn } from '../../lib/color';
import { DueMeta, PriorityIcon } from './CardBits';
import { columnAccent } from './KanbanColumn';

type SortKey = 'title' | 'list' | 'assignees' | 'due' | 'priority' | 'status';

interface Column {
  key: SortKey;
  label: string;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: 'title', label: 'Judul', className: 'w-[38%] pl-5' },
  { key: 'list', label: 'Kolom', className: 'w-[14%]' },
  { key: 'assignees', label: 'Assignee', className: 'w-[12%]' },
  { key: 'due', label: 'Tenggat', className: 'w-[14%]' },
  { key: 'priority', label: 'Prioritas', className: 'w-[11%]' },
  { key: 'status', label: 'Status', className: 'w-[11%] pr-5' },
];

const SURFACE = 'rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)]';

/**
 * List/table view (FR-14), styled like the Kanban cards: solid label pills, column
 * status dots, quiet priority/due meta. Sorting is client-side over the filtered cards.
 */
export function TableView({
  lists,
  cards,
  onOpenCard,
}: {
  lists: ListDTO[];
  cards: CardSummary[];
  onOpenCard: (id: string) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'list', dir: 1 });
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const listIndex = useMemo(() => new Map(lists.map((l, i) => [l.id, i])), [lists]);

  const sorted = useMemo(() => {
    const value = (c: CardSummary): string | number => {
      switch (sort.key) {
        case 'title':
          return c.title.toLowerCase();
        case 'list':
          return listIndex.get(c.listId) ?? Number.MAX_SAFE_INTEGER;
        case 'assignees':
          return c.assignees[0]?.name.toLowerCase() ?? '￿';
        case 'due':
          return c.dueDate ?? '￿';
        case 'priority':
          return -PRIORITIES.indexOf(c.priority);
        case 'status':
          return c.completedAt ? 1 : 0;
      }
    };
    return [...cards].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : comparePosition(String(va), String(vb));
      // Stable tie-break: board order within a column.
      return cmp * sort.dir || comparePosition(a.position, b.position);
    });
  }, [cards, sort, listIndex]);

  if (cards.length === 0) {
    return (
      <div className={clsx(SURFACE, 'py-6')}>
        <EmptyState title="Tidak ada kartu" description="Tidak ada kartu yang cocok dengan filter saat ini." />
      </div>
    );
  }

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }));

  return (
    <div className={clsx(SURFACE, 'overflow-x-auto')}>
      <table className="w-full min-w-[880px] table-fixed text-left">
        <thead>
          <tr className="border-b border-line">
            {COLUMNS.map((col) => {
              const active = sort.key === col.key;
              return (
                <th key={col.key} className={clsx('h-12 px-4 font-normal', col.className)} aria-sort={sortAria(sort, col.key)}>
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={clsx(
                      'group/sort -mx-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg px-1.5 text-[0.8125rem] font-medium transition-colors',
                      active ? 'text-ink' : 'text-ink-subtle hover:text-ink',
                    )}
                  >
                    {col.label}
                    {active ? (
                      sort.dir === 1 ? (
                        <ArrowUp className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowDown className="h-3.5 w-3.5" />
                      )
                    ) : (
                      <ChevronsUpDown className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover/sort:opacity-100" />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((card) => {
            const list = listById.get(card.listId);
            const done = Boolean(card.completedAt);
            const hasMeta = card.labels.length > 0 || card.commentCount > 0 || card.attachmentCount > 0;
            return (
              <tr
                key={card.id}
                tabIndex={0}
                onClick={() => onOpenCard(card.id)}
                onKeyDown={(e) => e.key === 'Enter' && onOpenCard(card.id)}
                className="cursor-pointer border-b border-line-subtle outline-none transition-colors last:border-0 hover:bg-canvas focus-visible:bg-brand-soft"
              >
                <td className="py-3.5 pl-5 pr-4">
                  <div className="flex items-start gap-2.5">
                    {done ? (
                      <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 fill-success text-surface" aria-label="Selesai" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0 text-line-strong" aria-label="Belum selesai" />
                    )}
                    <div className="min-w-0">
                      <p
                        title={card.title}
                        className={clsx(
                          'truncate text-[0.875rem] font-semibold leading-snug',
                          done ? 'text-ink-subtle line-through decoration-ink-subtle/60' : 'text-ink',
                        )}
                      >
                        {card.title}
                      </p>
                      {hasMeta && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {card.labels.map((l) => (
                            <span
                              key={l.id}
                              className="inline-flex h-5 max-w-[140px] items-center rounded-full px-2 text-[11px] font-bold"
                              style={{ backgroundColor: l.color, color: readableTextOn(l.color) }}
                            >
                              <span className="truncate">{l.name}</span>
                            </span>
                          ))}
                          {card.commentCount > 0 && (
                            <Counter icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />} label={`${card.commentCount} komentar`}>
                              {card.commentCount}
                            </Counter>
                          )}
                          {card.attachmentCount > 0 && (
                            <Counter icon={<Paperclip className="h-3.5 w-3.5" aria-hidden />} label={`${card.attachmentCount} lampiran`}>
                              {card.attachmentCount}
                            </Counter>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  {list && (
                    <span className="inline-flex max-w-full items-center gap-2 text-[0.8125rem] font-medium text-ink-muted">
                      <span className={clsx('h-2 w-2 shrink-0 rounded-full', columnAccent(list.name))} aria-hidden />
                      <span className="truncate">{list.name}</span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3.5">
                  {card.assignees.length ? <AvatarStack users={card.assignees} size="md" max={3} /> : <Dash />}
                </td>
                <td className="px-4 py-3.5 text-[0.8125rem]">
                  {card.dueDate ? <DueMeta dueDate={card.dueDate} completedAt={card.completedAt} /> : <Dash />}
                </td>
                <td className="px-4 py-3.5">
                  {card.priority === 'NONE' ? (
                    <Dash />
                  ) : (
                    <span
                      className={clsx(
                        'inline-flex items-center gap-2 text-[0.8125rem] font-medium',
                        card.priority === 'URGENT' ? 'text-danger-ink' : 'text-ink-muted',
                      )}
                    >
                      <PriorityIcon priority={card.priority} />
                      {PRIORITY_LABEL[card.priority]}
                    </span>
                  )}
                </td>
                <td className="py-3.5 pl-4 pr-5">
                  <span
                    className={clsx(
                      'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-bold',
                      done ? 'bg-success-soft text-success-ink' : 'bg-brand-subtle text-brand-strong',
                    )}
                  >
                    <span className={clsx('h-1.5 w-1.5 rounded-full', done ? 'bg-success' : 'bg-brand')} aria-hidden />
                    {done ? 'Selesai' : 'Berjalan'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Counter({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-caption font-semibold tabular-nums text-ink-subtle" title={label}>
      {icon}
      {children}
    </span>
  );
}

function Dash() {
  return <span className="text-ink-subtle/60">—</span>;
}

function sortAria(sort: { key: SortKey; dir: 1 | -1 }, key: SortKey): 'ascending' | 'descending' | 'none' {
  if (sort.key !== key) return 'none';
  return sort.dir === 1 ? 'ascending' : 'descending';
}
