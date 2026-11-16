import { CalendarDays, CircleDashed, Search, Tag, UserRound, X } from 'lucide-react';
import type { LabelDTO, UserSummary } from '@nexus/shared';
import { Avatar } from '../../components/ui';
import { FilterMenu } from './FilterMenu';
import { EMPTY_FILTERS, isFiltering, type BoardFilters, type DueFilter, type StatusFilter } from './filters';

interface FilterBarProps {
  value: BoardFilters;
  onChange: (value: BoardFilters) => void;
  members: UserSummary[];
  labels: LabelDTO[];
}

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'overdue', label: 'Terlambat' },
  { value: 'today', label: 'Hari ini' },
  { value: 'week', label: '7 hari ke depan' },
  { value: 'none', label: 'Tanpa tenggat' },
];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Semua' },
  { value: 'open', label: 'Belum selesai' },
  { value: 'done', label: 'Selesai' },
];

export function FilterBar({ value, onChange, members, labels }: FilterBarProps) {
  const set = <K extends keyof BoardFilters>(key: K, v: BoardFilters[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <label className="relative">
        <span className="sr-only">Cari kartu</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
        <input
          type="search"
          placeholder="Cari kartu…"
          value={value.query}
          onChange={(e) => set('query', e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && set('query', '')}
          className="h-8 w-52 rounded-lg border border-line bg-surface pl-8 pr-2.5 text-body text-ink outline-none transition-[border-color,box-shadow,width] placeholder:text-ink-subtle hover:border-line-strong focus:w-64 focus:border-brand-border focus:ring-4 focus:ring-brand-subtle"
        />
      </label>

      <FilterMenu
        label="Assignee"
        icon={<UserRound />}
        value={value.assigneeId}
        emptyValue=""
        onChange={(v) => set('assigneeId', v)}
        options={[
          { value: '', label: 'Semua orang' },
          ...members.map((m) => ({ value: m.id, label: m.name, leading: <Avatar user={m} size="xs" /> })),
        ]}
      />
      <FilterMenu
        label="Label"
        icon={<Tag />}
        value={value.labelId}
        emptyValue=""
        onChange={(v) => set('labelId', v)}
        options={[
          { value: '', label: 'Semua label' },
          ...labels.map((l) => ({
            value: l.id,
            label: l.name,
            leading: <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />,
          })),
        ]}
      />
      <FilterMenu
        label="Tenggat"
        icon={<CalendarDays />}
        value={value.due}
        emptyValue="all"
        onChange={(v) => set('due', v)}
        options={DUE_OPTIONS}
      />
      <FilterMenu
        label="Status"
        icon={<CircleDashed />}
        value={value.status}
        emptyValue="all"
        onChange={(v) => set('status', v)}
        options={STATUS_OPTIONS}
      />

      {isFiltering(value) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-body font-semibold text-ink-subtle hover:bg-canvas-deep hover:text-ink"
        >
          <X className="h-3.5 w-3.5" /> Reset
        </button>
      )}
    </div>
  );
}
