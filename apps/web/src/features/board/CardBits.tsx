import clsx from 'clsx';
import { CalendarClock, CalendarDays, CheckCircle2, Flag } from 'lucide-react';
import { PRIORITY_LABEL, type LabelDTO, type Priority } from '@nexus/shared';
import { Badge, type Tone } from '../../components/ui';
import { dueStatus, formatDue, type DueStatus } from '../../lib/format';

// ─── Pill variants (lists, My Tasks, card modal) ──────────────────────

const dueTone: Record<DueStatus, Tone> = {
  none: 'neutral',
  done: 'success',
  overdue: 'danger',
  today: 'warning',
  soon: 'info',
  later: 'neutral',
};

export function DuePill({ dueDate, completedAt }: { dueDate: string | null; completedAt: string | null }) {
  if (!dueDate) return null;
  const status = dueStatus(dueDate, completedAt);
  return (
    <Badge tone={dueTone[status]} icon={status === 'done' ? <CheckCircle2 /> : <CalendarClock />}>
      {formatDue(dueDate)}
    </Badge>
  );
}

const priorityTone: Record<Priority, Tone> = {
  NONE: 'neutral',
  LOW: 'info',
  MEDIUM: 'warning',
  HIGH: 'danger',
  URGENT: 'danger',
};

export function PriorityBadge({ priority, hideNone = true }: { priority: Priority; hideNone?: boolean }) {
  if (priority === 'NONE' && hideNone) return null;
  return (
    <Badge tone={priorityTone[priority]} icon={<Flag />}>
      {PRIORITY_LABEL[priority]}
    </Badge>
  );
}

export function ChecklistProgress({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas-deep">
        <div className={done === total ? 'h-full bg-success' : 'h-full bg-brand'} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-caption font-medium text-ink-subtle">
        {done}/{total}
      </span>
    </div>
  );
}

// ─── Quiet variants for dense Kanban cards ────────────────────────────
// Color is reserved for things that need attention (overdue, urgent); everything
// else stays in neutral ink so a full board reads calmly.

const PRIORITY_BARS: Record<Priority, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 3 };

/** Signal-strength glyph: 1–3 bars; Urgent is a filled red square with "!". */
export function PriorityIcon({ priority }: { priority: Priority }) {
  if (priority === 'NONE') return null;
  const label = `Prioritas ${PRIORITY_LABEL[priority].toLowerCase()}`;

  if (priority === 'URGENT') {
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-danger text-[10px] font-extrabold leading-none text-white"
      >
        !
      </span>
    );
  }

  const filled = PRIORITY_BARS[priority];
  return (
    <svg role="img" aria-label={label} viewBox="0 0 14 14" className="h-3.5 w-3.5">
      <title>{label}</title>
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={1 + i * 4.5}
          y={9 - i * 3.5}
          width="3"
          height={4 + i * 3.5}
          rx="1"
          className={i < filled ? 'fill-ink-muted' : 'fill-line-strong'}
        />
      ))}
    </svg>
  );
}

const dueText: Record<DueStatus, string> = {
  none: 'text-ink-subtle',
  done: 'text-success-ink',
  overdue: 'font-semibold text-danger-ink',
  today: 'font-semibold text-warning-ink',
  soon: 'text-ink-muted',
  later: 'text-ink-subtle',
};

export function DueMeta({ dueDate, completedAt }: { dueDate: string | null; completedAt: string | null }) {
  if (!dueDate) return null;
  const status = dueStatus(dueDate, completedAt);
  const hint = status === 'overdue' ? 'Terlambat' : status === 'today' ? 'Jatuh tempo hari ini' : 'Tenggat';
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap', dueText[status])} title={hint}>
      <CalendarDays className="h-3.5 w-3.5" aria-hidden />
      {formatDue(dueDate)}
    </span>
  );
}

/** Tiny ring that fills with checklist progress, followed by "2/4". */
export function ChecklistMeta({ done, total }: { done: number; total: number }) {
  if (total === 0) return null;
  const complete = done === total;
  const circumference = 2 * Math.PI * 5;
  return (
    <span
      className={clsx('inline-flex items-center gap-1 tabular-nums', complete ? 'text-success-ink' : 'text-ink-subtle')}
      title={`Checklist ${done} dari ${total}`}
    >
      <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 -rotate-90" aria-hidden>
        <circle cx="7" cy="7" r="5" fill="none" strokeWidth="2" className="stroke-line-strong" />
        <circle
          cx="7"
          cy="7"
          r="5"
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - done / total)}
          className={complete ? 'stroke-success' : 'stroke-brand'}
        />
      </svg>
      {done}/{total}
    </span>
  );
}

/** Outlined chips with a color dot — quieter than tinted pills when a board is full. */
export function LabelChips({ labels, max = 3 }: { labels: LabelDTO[]; max?: number }) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((l) => (
        <span
          key={l.id}
          className="inline-flex max-w-[140px] items-center gap-1.5 rounded-md border border-line px-1.5 py-px text-caption font-medium text-ink-muted"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} aria-hidden />
          <span className="truncate">{l.name}</span>
        </span>
      ))}
      {rest > 0 && (
        <span className="rounded-md border border-line px-1.5 py-px text-caption font-medium text-ink-subtle">+{rest}</span>
      )}
    </div>
  );
}
