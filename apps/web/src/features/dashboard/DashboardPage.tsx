import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import clsx from 'clsx';
import { Building2, ChevronDown, Download, FolderKanban, LayoutDashboard, RefreshCw, ShieldCheck, UserRound } from 'lucide-react';
import { PRIORITY_LABEL, type DashboardDTO, type DashboardScope } from '@nexus/shared';
import { Button, ErrorState, Menu, MenuItem, Skeleton } from '../../components/ui';
import { api } from '../../lib/api';
import { qk } from '../../lib/queryKeys';
import { useCurrentUser } from '../../stores/auth';
import { AnnouncementsPanel } from './AnnouncementsPanel';
import { downloadCsv } from './csv';
import {
  ActivityFeed,
  DivisionTable,
  OrgHealthList,
  Panel,
  PanelLink,
  PriorityBreakdown,
  ProjectProgressList,
  SolidBadge,
  StatTiles,
  UpcomingList,
  WorkloadTable,
} from './DashboardSections';
import { TrendChart } from './TrendChart';

const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const SCOPE_META: Record<DashboardScope, { title: string; icon: ReactNode }> = {
  organization: { title: 'Dashboard manajemen', icon: <ShieldCheck /> },
  division: { title: 'Dashboard divisi', icon: <Building2 /> },
  personal: { title: 'Dashboard saya', icon: <UserRound /> },
};

function greeting(date: Date): string {
  const h = date.getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/**
 * Home page. Content depends on the caller's role (decided by the API):
 * management (Owner/Admin), division (division leads) or personal (members/guests).
 */
export function DashboardPage() {
  const user = useCurrentUser();
  const dashboard = useQuery({
    queryKey: qk.dashboard,
    queryFn: () => api.dashboard.get(TIME_ZONE),
    refetchInterval: 60_000,
  });
  const now = new Date();
  const data = dashboard.data;
  const meta = data ? SCOPE_META[data.scope] : null;

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="border-b border-line bg-surface px-8 pb-6 pt-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-ink-subtle">{format(now, 'EEEE, d MMMM yyyy', { locale: id })}</p>
            <h1 className="mt-1 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
              {greeting(now)}, {user.name.split(' ')[0]}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.875rem] text-ink-muted">
              {meta && data ? (
                <>
                  <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-brand px-3 text-caption font-bold text-white shadow-[0_6px_14px_-8px_rgba(38,82,160,0.7)] [&>svg]:h-3.5 [&>svg]:w-3.5">
                    {meta.icon}
                    {meta.title}
                  </span>
                  <span>{data.scopeLabel}</span>
                </>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" /> Memuat ringkasan…
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {data && (
              <span className="hidden text-caption text-ink-subtle sm:inline">
                Diperbarui {format(parseISO(data.generatedAt), 'HH:mm')}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label="Muat ulang"
              title="Muat ulang"
              icon={<RefreshCw className={clsx('h-4 w-4', dashboard.isFetching && 'animate-spin')} />}
              onClick={() => void dashboard.refetch()}
            />
            {data && data.scope !== 'personal' && <ExportMenu data={data} />}
          </div>
        </div>
      </header>

      <div className="flex-1 px-8 py-6">
        {dashboard.isPending ? (
          <DashboardSkeleton />
        ) : dashboard.isError ? (
          <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
        ) : dashboard.data.scope === 'personal' ? (
          <PersonalDashboard data={dashboard.data} />
        ) : (
          <TeamDashboard data={dashboard.data} />
        )}
      </div>
    </div>
  );
}

// ─── Layouts ──────────────────────────────────────────────────────────

/** Owner / Admin / Division lead. */
function TeamDashboard({ data }: { data: DashboardDTO }) {
  const { team, personal, org } = data;
  const [showAllPeople, setShowAllPeople] = useState(false);
  const workload = team.workload ?? [];
  const isOrg = data.scope === 'organization';

  return (
    <div className="space-y-5">
      <StatTiles stats={team.stats} variant="team" />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Panel title="Tren penyelesaian" description={`Kartu dibuat vs diselesaikan · ${data.scopeLabel.toLowerCase()}`}>
            <TrendChart points={team.trend} />
          </Panel>

          {isOrg && team.divisions && (
            <Panel title="Perbandingan divisi" description="Beban dan kemajuan tiap divisi." bodyClassName="">
              <DivisionTable rows={team.divisions} />
            </Panel>
          )}

          <Panel
            title="Beban kerja tim"
            description="Tugas aktif per orang. Gunakan untuk menyeimbangkan pembagian kerja."
            bodyClassName=""
            action={
              workload.length > 8 && (
                <button type="button" onClick={() => setShowAllPeople((v) => !v)} className="text-caption font-bold text-brand-strong hover:underline">
                  {showAllPeople ? 'Tampilkan lebih sedikit' : `Lihat semua (${workload.length})`}
                </button>
              )
            }
          >
            <WorkloadTable rows={workload} limit={showAllPeople ? workload.length : 8} />
          </Panel>

          <Panel
            title="Progres proyek"
            description="Diurutkan dari yang paling banyak terlambat."
            bodyClassName=""
            action={<PanelLink to="/projects">Semua board</PanelLink>}
          >
            <ProjectProgressList rows={team.projects} limit={8} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <AnnouncementsPanel />

          <Panel
            title="Tugas Anda"
            description={
              <span className="flex flex-wrap gap-1.5">
                <SolidBadge tone="brand">{personal.stats.open} aktif</SolidBadge>
                {personal.stats.overdue > 0 && <SolidBadge tone="danger">{personal.stats.overdue} terlambat</SolidBadge>}
                <SolidBadge tone="success">{personal.stats.completedThisWeek} selesai 7 hari</SolidBadge>
              </span>
            }
            bodyClassName=""
            action={<PanelLink to="/my-tasks">Semua</PanelLink>}
          >
            <UpcomingList tasks={personal.upcoming} />
          </Panel>

          <Panel title="Prioritas kartu aktif" action={<SolidBadge tone="brand">{team.stats.open} aktif</SolidBadge>}>
            <PriorityBreakdown priorities={team.priorities} open={team.stats.open} />
          </Panel>

          {org && (
            <Panel title="Kesehatan organisasi" bodyClassName="" action={<PanelLink to="/admin">Kelola</PanelLink>}>
              <OrgHealthList org={org} />
            </Panel>
          )}

          <Panel title="Aktivitas terbaru" bodyClassName="">
            <ActivityFeed items={team.activity} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Member / Guest: own work first, then the projects they belong to. */
function PersonalDashboard({ data }: { data: DashboardDTO }) {
  const { team, personal } = data;
  return (
    <div className="space-y-5">
      <StatTiles stats={personal.stats} variant="personal" />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Panel
            title="Tugas berikutnya"
            description="Yang terlambat di atas, lalu berdasarkan tenggat terdekat."
            bodyClassName=""
            action={<PanelLink to="/my-tasks">Semua tugas saya</PanelLink>}
          >
            <UpcomingList tasks={personal.upcoming} />
          </Panel>

          <Panel title="Tren proyek Anda" description={`Kartu dibuat vs diselesaikan di ${data.scopeLabel}`}>
            <TrendChart points={team.trend} />
          </Panel>

          <Panel title="Progres proyek" bodyClassName="" action={<PanelLink to="/projects">Semua board</PanelLink>}>
            <ProjectProgressList rows={team.projects} limit={10} />
          </Panel>
        </div>

        <div className="min-w-0 space-y-5">
          <AnnouncementsPanel />

          <Panel title="Ringkasan proyek" description={data.scopeLabel}>
            <dl className="grid grid-cols-2 gap-3">
              <MiniStat label="Kartu aktif" value={team.stats.open} />
              <MiniStat label="Terlambat" value={team.stats.overdue} danger={team.stats.overdue > 0} />
              <MiniStat label="Selesai 7 hari" value={team.stats.completedThisWeek} />
              <MiniStat label="Belum ditugaskan" value={team.stats.unassigned} />
            </dl>
          </Panel>

          <Panel title="Prioritas kartu aktif" action={<SolidBadge tone="brand">{team.stats.open} aktif</SolidBadge>}>
            <PriorityBreakdown priorities={team.priorities} open={team.stats.open} />
          </Panel>

          <Panel title="Aktivitas terbaru" bodyClassName="">
            <ActivityFeed items={team.activity} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-canvas px-3.5 py-3 ring-1 ring-inset ring-line-subtle">
      <dt className="text-caption text-ink-subtle">{label}</dt>
      <dd className="mt-1.5 flex h-7 items-center">
        {danger ? (
          <SolidBadge tone="danger" className="h-7 px-3 text-[0.875rem]">
            {value}
          </SolidBadge>
        ) : (
          <span className="text-[1.25rem] font-semibold tabular-nums text-ink">{value}</span>
        )}
      </dd>
    </div>
  );
}

// ─── Export (FR-45) ───────────────────────────────────────────────────

function ExportMenu({ data }: { data: DashboardDTO }) {
  const stamp = format(new Date(), 'yyyy-MM-dd');
  const { team } = data;

  const exportWorkload = () =>
    downloadCsv(`beban-kerja-${stamp}.csv`, team.workload ?? [], [
      { header: 'Nama', value: (r) => r.user.name },
      { header: 'Email', value: (r) => r.user.email },
      { header: 'Tugas aktif', value: (r) => r.open },
      { header: 'Terlambat', value: (r) => r.overdue },
      { header: 'Jatuh tempo 7 hari', value: (r) => r.dueThisWeek },
      { header: 'Prioritas tinggi/mendesak', value: (r) => r.urgent },
      { header: 'Selesai 7 hari', value: (r) => r.completedThisWeek },
    ]);
  const exportProjects = () =>
    downloadCsv(`progres-proyek-${stamp}.csv`, team.projects, [
      { header: 'Proyek', value: (r) => r.name },
      { header: 'Divisi', value: (r) => r.divisionName },
      { header: 'Kartu aktif', value: (r) => r.open },
      { header: 'Terlambat', value: (r) => r.overdue },
      { header: 'Selesai 7 hari', value: (r) => r.completedThisWeek },
      { header: 'Total selesai', value: (r) => r.completedTotal },
      { header: 'Progres (%)', value: (r) => (r.open + r.completedTotal > 0 ? Math.round((r.completedTotal / (r.open + r.completedTotal)) * 100) : 0) },
      { header: 'Anggota', value: (r) => r.memberCount },
    ]);
  const exportDivisions = () =>
    downloadCsv(`divisi-${stamp}.csv`, team.divisions ?? [], [
      { header: 'Divisi', value: (r) => r.name },
      { header: 'Proyek', value: (r) => r.projectCount },
      { header: 'Anggota', value: (r) => r.memberCount },
      { header: 'Kartu aktif', value: (r) => r.open },
      { header: 'Terlambat', value: (r) => r.overdue },
      { header: 'Selesai 7 hari', value: (r) => r.completedThisWeek },
    ]);
  const exportSummary = () =>
    downloadCsv(`ringkasan-${stamp}.csv`, [
      ['Cakupan', data.scopeLabel],
      ['Kartu aktif', team.stats.open],
      ['Terlambat', team.stats.overdue],
      ['Jatuh tempo hari ini', team.stats.dueToday],
      ['Jatuh tempo 7 hari', team.stats.dueThisWeek],
      ['Belum ditugaskan', team.stats.unassigned],
      ['Dibuat 7 hari', team.stats.createdThisWeek],
      ['Selesai 7 hari', team.stats.completedThisWeek],
      ['Selesai 7 hari sebelumnya', team.stats.completedLastWeek],
      ...team.priorities.map((p): [string, number] => [`Prioritas ${p.priority === 'NONE' ? 'tidak ada' : PRIORITY_LABEL[p.priority]}`, p.count]),
    ] as [string, string | number][], [
      { header: 'Metrik', value: (r) => r[0] },
      { header: 'Nilai', value: (r) => r[1] },
    ]);

  return (
    <Menu
      className="w-56"
      trigger={({ toggle }) => (
        <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={toggle}>
          Ekspor CSV
          <ChevronDown className="h-3.5 w-3.5 text-ink-subtle" />
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem icon={<LayoutDashboard />} onSelect={() => (close(), exportSummary())}>
            Ringkasan
          </MenuItem>
          <MenuItem icon={<UserRound />} onSelect={() => (close(), exportWorkload())}>
            Beban kerja per orang
          </MenuItem>
          <MenuItem icon={<FolderKanban />} onSelect={() => (close(), exportProjects())}>
            Progres proyek
          </MenuItem>
          {team.divisions && (
            <MenuItem icon={<Building2 />} onSelect={() => (close(), exportDivisions())}>
              Perbandingan divisi
            </MenuItem>
          )}
        </>
      )}
    </Menu>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[118px] rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Skeleton className="h-80 rounded-2xl xl:col-span-2" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}
