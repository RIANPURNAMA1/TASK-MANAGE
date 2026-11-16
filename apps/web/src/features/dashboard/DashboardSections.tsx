import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Inbox,
  Mail,
  MonitorSmartphone,
  ShieldAlert,
  UserRound,
  Users,
  UserX,
} from 'lucide-react';
import {
  PRIORITY_LABEL,
  type DashboardActivityItem,
  type DashboardDivisionRow,
  type DashboardOrgHealth,
  type DashboardProjectRow,
  type DashboardStats,
  type DashboardWorkloadRow,
  type MyTaskDTO,
  type Priority,
} from '@nexus/shared';
import { Avatar } from '../../components/ui';
import { ProjectGlyph } from '../../components/layout/ProjectSidebar';
import { dueStatus, formatDue, formatRelative } from '../../lib/format';
import { PriorityIcon } from '../board/CardBits';
import { activitySentence } from '../card/activityText';
import { useCardModal } from '../card/useCardModal';

// ─── Shell ────────────────────────────────────────────────────────────

export function Panel({
  title,
  description,
  action,
  children,
  bodyClassName = 'px-5 py-4',
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section className={clsx('flex flex-col rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle', className)}>
      <header className="flex min-h-[60px] items-center justify-between gap-3 border-b border-line-subtle px-5 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[0.9375rem] font-bold leading-tight text-ink">{title}</h2>
          {description && <div className="mt-1 text-caption text-ink-subtle">{description}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      <div className={clsx('flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}

// ─── Solid badge (same language as the Kanban label pills) ────────────

export type BadgeTone = 'brand' | 'danger' | 'warning' | 'success' | 'neutral';

const SOLID: Record<BadgeTone, string> = {
  brand: 'bg-brand text-white',
  danger: 'bg-danger text-white',
  warning: 'bg-warning text-white',
  success: 'bg-success text-white',
  neutral: 'bg-ink-subtle text-white',
};

export function SolidBadge({ tone, icon, children, className }: { tone: BadgeTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11px] font-bold tabular-nums [&>svg]:h-3 [&>svg]:w-3',
        SOLID[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-caption font-bold text-brand-strong hover:underline">
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

// ─── KPI tiles ────────────────────────────────────────────────────────

type TileTone = 'brand' | 'danger' | 'warning' | 'success' | 'neutral';

function StatTile({ label, value, icon, tone, hint }: { label: string; value: number; icon: ReactNode; tone: TileTone; hint?: ReactNode }) {
  return (
    <div className="flex h-full items-start gap-4 rounded-2xl bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle">
      <span
        className={clsx(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-[0_6px_14px_-8px_rgba(15,23,42,0.45)] [&>svg]:h-5 [&>svg]:w-5',
          SOLID[tone],
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.8125rem] font-medium text-ink-muted">{label}</p>
        <p className="mt-1 text-[1.75rem] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">{value}</p>
        {hint && <p className="mt-2 truncate text-caption text-ink-subtle">{hint}</p>}
      </div>
    </div>
  );
}

function WeekDelta({ current, previous }: { current: number; previous: number }) {
  const diff = current - previous;
  if (diff === 0) return <>Sama dengan 7 hari sebelumnya</>;
  const up = diff > 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <SolidBadge tone={up ? 'success' : 'danger'} icon={up ? <ArrowUpRight aria-hidden /> : <ArrowDownRight aria-hidden />} className="h-5 px-1.5">
        {up ? '+' : ''}
        {diff}
      </SolidBadge>
      vs 7 hari sebelumnya
    </span>
  );
}

/** Four headline numbers. `team` adds "belum ditugaskan" instead of "jatuh tempo". */
export function StatTiles({ stats, variant }: { stats: DashboardStats; variant: 'team' | 'personal' }) {
  const overduePct = stats.open > 0 ? Math.round((stats.overdue / stats.open) * 100) : 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label={variant === 'team' ? 'Kartu aktif' : 'Tugas aktif Anda'}
        value={stats.open}
        icon={<CircleDot />}
        tone="brand"
        hint={`${stats.createdThisWeek} dibuat dalam 7 hari`}
      />
      <StatTile
        label="Terlambat"
        value={stats.overdue}
        icon={<AlertTriangle />}
        tone={stats.overdue > 0 ? 'danger' : 'neutral'}
        hint={stats.overdue > 0 ? `${overduePct}% dari kartu aktif` : 'Tidak ada yang terlambat'}
      />
      {variant === 'team' ? (
        <StatTile
          label="Belum ditugaskan"
          value={stats.unassigned}
          icon={<UserRound />}
          tone={stats.unassigned > 0 ? 'warning' : 'neutral'}
          hint={`${stats.dueThisWeek} jatuh tempo dalam 7 hari`}
        />
      ) : (
        <StatTile
          label="Jatuh tempo 7 hari"
          value={stats.dueThisWeek}
          icon={<CalendarClock />}
          tone={stats.dueToday > 0 ? 'warning' : 'neutral'}
          hint={stats.dueToday > 0 ? `${stats.dueToday} jatuh tempo hari ini` : 'Tidak ada yang jatuh tempo hari ini'}
        />
      )}
      <StatTile
        label="Selesai 7 hari"
        value={stats.completedThisWeek}
        icon={<CheckCircle2 />}
        tone="success"
        hint={<WeekDelta current={stats.completedThisWeek} previous={stats.completedLastWeek} />}
      />
    </div>
  );
}

// ─── Priority breakdown ───────────────────────────────────────────────

export function PriorityBreakdown({ priorities, open }: { priorities: { priority: Priority; count: number }[]; open: number }) {
  const max = Math.max(1, ...priorities.map((p) => p.count));
  return (
    <ul className="space-y-3">
      {priorities.map(({ priority, count }) => (
        <li key={priority}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-[0.8125rem]">
            <span className="inline-flex items-center gap-2 font-medium text-ink-muted">
              {priority === 'NONE' ? <span className="h-3.5 w-3.5" aria-hidden /> : <PriorityIcon priority={priority} />}
              {priority === 'NONE' ? 'Tanpa prioritas' : PRIORITY_LABEL[priority]}
            </span>
            <span className="tabular-nums text-ink-subtle">
              <span className="font-bold text-ink">{count}</span>
              {open > 0 && <span className="ml-1.5">{Math.round((count / open) * 100)}%</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-canvas-deep" aria-hidden>
            {count > 0 && (
              <div
                className={clsx('h-full rounded-full', priority === 'URGENT' ? 'bg-danger' : 'bg-brand/80')}
                style={{ width: `${(count / max) * 100}%` }}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Tables ───────────────────────────────────────────────────────────

const TH = 'h-10 px-3 text-left text-caption font-semibold text-ink-subtle first:pl-5 last:pr-5';
const TD = 'h-14 px-3 py-2.5 align-middle first:pl-5 last:pr-5';

function Num({ value, danger }: { value: number; danger?: boolean }) {
  if (value === 0) return <span className="text-ink-subtle/50">—</span>;
  if (danger) return <SolidBadge tone="danger">{value}</SolidBadge>;
  return <span className="font-semibold tabular-nums text-ink">{value}</span>;
}

function InlineBar({ value, max }: { value: number; max: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-6 text-right text-[0.8125rem] font-semibold tabular-nums text-ink">{value}</span>
      <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-canvas-deep" aria-hidden>
        {value > 0 && <div className="h-full rounded-full bg-brand" style={{ width: `${(value / Math.max(1, max)) * 100}%` }} />}
      </div>
    </div>
  );
}

export function WorkloadTable({ rows, limit }: { rows: DashboardWorkloadRow[]; limit: number }) {
  const max = Math.max(1, ...rows.map((r) => r.open));
  const shown = rows.slice(0, limit);
  if (rows.length === 0) return <EmptyLine>Belum ada anggota dalam cakupan ini.</EmptyLine>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead>
          <tr className="border-b border-line-subtle bg-canvas/60">
            <th className={TH}>Anggota</th>
            <th className={clsx(TH, 'w-[30%]')}>Tugas aktif</th>
            <th className={clsx(TH, 'text-right')}>Terlambat</th>
            <th className={clsx(TH, 'text-right')}>Tempo 7 hari</th>
            <th className={clsx(TH, 'text-right')}>Prioritas tinggi</th>
            <th className={clsx(TH, 'text-right')}>Selesai 7 hari</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.user.id} className="border-b border-line-subtle last:border-0">
              <td className={TD}>
                <div className="flex items-center gap-2.5">
                  <Avatar user={r.user} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-[0.8125rem] font-semibold text-ink">{r.user.name}</p>
                    {r.open === 0 && <p className="text-[11px] text-ink-subtle">Tidak ada tugas aktif</p>}
                  </div>
                </div>
              </td>
              <td className={TD}>
                <InlineBar value={r.open} max={max} />
              </td>
              <td className={clsx(TD, 'text-right text-[0.8125rem]')}>
                <Num value={r.overdue} danger />
              </td>
              <td className={clsx(TD, 'text-right text-[0.8125rem]')}>
                <Num value={r.dueThisWeek} />
              </td>
              <td className={clsx(TD, 'text-right text-[0.8125rem]')}>
                <Num value={r.urgent} />
              </td>
              <td className={clsx(TD, 'text-right text-[0.8125rem]')}>
                <Num value={r.completedThisWeek} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DivisionTable({ rows }: { rows: DashboardDivisionRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.open));
  if (rows.length === 0) return <EmptyLine>Belum ada divisi.</EmptyLine>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px]">
        <thead>
          <tr className="border-b border-line-subtle bg-canvas/60">
            <th className={TH}>Divisi</th>
            <th className={clsx(TH, 'text-right')}>Proyek</th>
            <th className={clsx(TH, 'text-right')}>Anggota</th>
            <th className={clsx(TH, 'w-[28%]')}>Kartu aktif</th>
            <th className={clsx(TH, 'text-right')}>Terlambat</th>
            <th className={clsx(TH, 'text-right')}>Selesai 7 hari</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-b border-line-subtle transition-colors last:border-0 hover:bg-canvas/70">
              <td className={TD}>
                <Link to={`/divisions/${d.id}`} className="inline-flex items-center gap-2.5 text-[0.8125rem] font-semibold text-ink hover:text-brand-strong">
                  <span className="h-3 w-3 shrink-0 rounded-full border-[3px]" style={{ borderColor: d.color }} aria-hidden />
                  {d.name}
                </Link>
              </td>
              <td className={clsx(TD, 'text-right text-[0.8125rem]')}>
                <Num value={d.projectCount} />
              </td>
              <td className={clsx(TD, 'text-right text-[0.8125rem]')}>
                <Num value={d.memberCount} />
              </td>
              <td className={TD}>
                <InlineBar value={d.open} max={max} />
              </td>
              <td className={clsx(TD, 'text-right text-[0.8125rem]')}>
                <Num value={d.overdue} danger />
              </td>
              <td className={clsx(TD, 'text-right text-[0.8125rem]')}>
                <Num value={d.completedThisWeek} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Lists ────────────────────────────────────────────────────────────

export function ProjectProgressList({ rows, limit }: { rows: DashboardProjectRow[]; limit: number }) {
  if (rows.length === 0) return <EmptyLine>Belum ada proyek aktif.</EmptyLine>;
  return (
    <ul className="divide-y divide-line-subtle">
      {rows.slice(0, limit).map((p) => {
        const total = p.open + p.completedTotal;
        const pct = total > 0 ? Math.round((p.completedTotal / total) * 100) : 0;
        return (
          <li key={p.id}>
            <Link to={`/projects/${p.id}`} className="group flex items-start gap-3.5 px-5 py-3.5 transition-colors hover:bg-canvas/70">
              <ProjectGlyph color={p.color} className="mt-[3px] h-4 w-4 rounded-[5px] border-[3px]" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-[0.8125rem] font-semibold text-ink group-hover:text-brand-strong">{p.name}</p>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {p.overdue > 0 && (
                      <SolidBadge tone="danger" icon={<AlertTriangle aria-hidden />}>
                        {p.overdue} terlambat
                      </SolidBadge>
                    )}
                    <SolidBadge tone={pct === 100 ? 'success' : 'brand'}>{pct}%</SolidBadge>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas-deep" aria-hidden>
                  {pct > 0 && <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />}
                </div>
                <p className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink-subtle">
                  <span>{p.divisionName}</span>
                  <span>
                    {p.completedTotal}/{total} selesai
                  </span>
                  <span>{p.open} aktif</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" aria-hidden />
                    {p.memberCount}
                  </span>
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function UpcomingList({ tasks }: { tasks: MyTaskDTO[] }) {
  const { openInProject } = useCardModal();
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center px-5 py-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-success text-white">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <p className="mt-2 text-[0.8125rem] font-semibold text-ink">Semua beres!</p>
        <p className="text-caption text-ink-subtle">Tidak ada tugas aktif yang ditugaskan ke Anda.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line-subtle">
      {tasks.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => openInProject(t.project.id, t.id)}
            className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-canvas/70"
          >
            <ProjectGlyph color={t.project.color} className="mt-1 h-3 w-3 rounded-[3px] border-2" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.8125rem] font-semibold text-ink">{t.title}</span>
              <span className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-subtle">
                <span className="truncate">{t.project.name}</span>
                <span aria-hidden>·</span>
                <span className="shrink-0">{t.list.name}</span>
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-2 self-center">
              <PriorityIcon priority={t.priority} />
              <DueBadge dueDate={t.dueDate} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Solid due-date pill: red when overdue, amber today, blue this week, gray later. */
function DueBadge({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return <SolidBadge tone="neutral">Tanpa tenggat</SolidBadge>;
  const status = dueStatus(dueDate, null);
  const tone: BadgeTone = status === 'overdue' ? 'danger' : status === 'today' ? 'warning' : status === 'soon' ? 'brand' : 'neutral';
  return (
    <SolidBadge tone={tone} icon={<CalendarClock aria-hidden />}>
      {formatDue(dueDate)}
    </SolidBadge>
  );
}

export function ActivityFeed({ items }: { items: DashboardActivityItem[] }) {
  const { openInProject } = useCardModal();
  if (items.length === 0) return <EmptyLine>Belum ada aktivitas.</EmptyLine>;
  return (
    <ol className="relative space-y-4 px-5 py-4">
      {items.map((a) => {
        const body = (
          <>
            <span className="font-semibold text-ink">{a.actor.name}</span> {activitySentence(a)}
            {a.cardTitle && (
              <>
                {' '}
                <span className="font-semibold text-ink">“{a.cardTitle}”</span>
              </>
            )}
          </>
        );
        return (
          <li key={a.id} className="flex gap-3">
            <Avatar user={a.actor} size="md" />
            <div className="min-w-0 flex-1">
              {a.cardId ? (
                <button
                  type="button"
                  onClick={() => openInProject(a.project.id, a.cardId!)}
                  className="text-left text-[0.8125rem] leading-snug text-ink-muted hover:[&>span]:text-brand-strong"
                >
                  {body}
                </button>
              ) : (
                <p className="text-[0.8125rem] leading-snug text-ink-muted">{body}</p>
              )}
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-subtle">
                <ProjectGlyph color={a.project.color} className="h-2.5 w-2.5 rounded-[3px] border-2" />
                <span className="truncate">{a.project.name}</span>
                <span aria-hidden>·</span>
                <span className="shrink-0">{formatRelative(a.createdAt)}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OrgHealthList({ org }: { org: DashboardOrgHealth }) {
  const rows: { icon: ReactNode; label: string; value: number; tone?: 'warning' | 'danger' }[] = [
    { icon: <Users />, label: 'Pengguna aktif', value: org.activeUsers },
    { icon: <Building2 />, label: 'Divisi', value: org.divisions },
    { icon: <UserRound />, label: 'Tamu (guest)', value: org.guests },
    { icon: <ShieldAlert />, label: 'Belum verifikasi email', value: org.unverifiedUsers, tone: org.unverifiedUsers > 0 ? 'warning' : undefined },
    { icon: <Mail />, label: 'Undangan menunggu', value: org.pendingInvitations },
    { icon: <MonitorSmartphone />, label: 'Sesi login aktif', value: org.activeSessions },
    { icon: <UserX />, label: 'Akun nonaktif', value: org.deactivatedUsers },
  ];
  return (
    <ul className="divide-y divide-line-subtle">
      {rows.map((r) => (
        <li key={r.label} className="flex h-12 items-center gap-3 px-5">
          <span
            className={clsx(
              'flex h-8 w-8 items-center justify-center rounded-xl [&>svg]:h-4 [&>svg]:w-4',
              r.tone === 'warning' ? SOLID.warning : SOLID.brand,
            )}
          >
            {r.icon}
          </span>
          <span className="flex-1 text-[0.8125rem] text-ink-muted">{r.label}</span>
          {r.tone === 'warning' ? (
            <SolidBadge tone="warning">{r.value}</SolidBadge>
          ) : (
            <span className="text-[0.875rem] font-bold tabular-nums text-ink">{r.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 px-5 py-8 text-center text-[0.8125rem] text-ink-subtle">
      <Inbox className="h-4 w-4" aria-hidden />
      {children}
    </p>
  );
}
