import { prisma, toUserSummary, userSummarySelect, type Prisma } from '@nexus/db';
import {
  PRIORITIES,
  isOrgAdmin,
  type DashboardActivityItem,
  type DashboardDTO,
  type DashboardDivisionRow,
  type DashboardOrgHealth,
  type DashboardProjectRow,
  type DashboardScope,
  type DashboardStats,
  type DashboardTrendPoint,
  type DashboardWorkloadRow,
  type MyTaskDTO,
  type Priority,
} from '@nexus/shared';
import type { Actor } from '../access/actor';
import { visibleProjectsWhere } from '../access/access.service';
import { activityInclude, toActivityDTO } from '../activity/activity.service';
import { listMyTasks } from '../board/my-tasks.service';

/**
 * Role-aware dashboard (FR-43 division report, FR-44 management report).
 *
 *  - Owner / Admin   → every active project in the organization, plus per-division
 *                      comparison, workload per person and organization health.
 *  - Division lead   → projects of the divisions they lead, plus workload per member.
 *  - Member / Guest  → the projects they belong to (no per-person workload).
 *
 * Everyone also gets their own assigned-work summary. Aggregation happens in memory
 * over a lean card projection: open cards plus those completed in the last 30 days.
 */

const DAY_MS = 24 * 3600 * 1000;
const TREND_DAYS = 14;
const CARD_CAP = 20_000;
const DEFAULT_TZ = 'Asia/Jakarta';

interface CardRow {
  id: string;
  projectId: string;
  priority: Priority;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  assignees: { userId: string }[];
}

const cardRowSelect = {
  id: true,
  projectId: true,
  priority: true,
  dueDate: true,
  completedAt: true,
  createdAt: true,
  assignees: { select: { userId: true } },
} satisfies Prisma.CardSelect;

function safeTimeZone(tz: string | undefined): string {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** `YYYY-MM-DD` of a date in the given time zone (en-CA formats ISO-style). */
function dayKeyIn(tz: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (d: Date) => fmt.format(d);
}

interface Clock {
  now: Date;
  weekAgo: Date;
  twoWeeksAgo: Date;
  weekAhead: Date;
  today: string;
  dayKey: (d: Date) => string;
}

function computeStats(rows: CardRow[], clock: Clock): DashboardStats {
  const { now, weekAgo, twoWeeksAgo, weekAhead, today, dayKey } = clock;
  const stats: DashboardStats = {
    open: 0,
    overdue: 0,
    dueToday: 0,
    dueThisWeek: 0,
    unassigned: 0,
    completedThisWeek: 0,
    completedLastWeek: 0,
    createdThisWeek: 0,
  };
  for (const c of rows) {
    if (c.createdAt >= weekAgo) stats.createdThisWeek++;
    if (c.completedAt) {
      if (c.completedAt >= weekAgo) stats.completedThisWeek++;
      else if (c.completedAt >= twoWeeksAgo) stats.completedLastWeek++;
      continue;
    }
    stats.open++;
    if (c.assignees.length === 0) stats.unassigned++;
    if (!c.dueDate) continue;
    if (c.dueDate < now) stats.overdue++;
    else {
      if (dayKey(c.dueDate) === today) stats.dueToday++;
      if (c.dueDate <= weekAhead) stats.dueThisWeek++;
    }
  }
  return stats;
}

function computeTrend(rows: CardRow[], clock: Clock): DashboardTrendPoint[] {
  const points = new Map<string, DashboardTrendPoint>();
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const date = clock.dayKey(new Date(clock.now.getTime() - i * DAY_MS));
    points.set(date, { date, created: 0, completed: 0 });
  }
  for (const c of rows) {
    const created = points.get(clock.dayKey(c.createdAt));
    if (created) created.created++;
    if (c.completedAt) {
      const done = points.get(clock.dayKey(c.completedAt));
      if (done) done.completed++;
    }
  }
  return [...points.values()];
}

async function resolveScope(actor: Actor) {
  const base: Prisma.ProjectWhereInput = { archivedAt: null, division: { orgId: actor.orgId, archivedAt: null } };

  if (isOrgAdmin(actor.orgRole)) {
    return { scope: 'organization' as DashboardScope, where: base, label: 'Seluruh organisasi', leadDivisionIds: null };
  }

  const leads = await prisma.divisionMember.findMany({
    where: { userId: actor.userId, role: 'LEAD', division: { orgId: actor.orgId, archivedAt: null } },
    select: { division: { select: { id: true, name: true } } },
    orderBy: { division: { name: 'asc' } },
  });
  if (leads.length > 0) {
    const names = leads.map((l) => l.division.name);
    const label = names.length <= 2 ? `Divisi ${names.join(' & ')}` : `${names.length} divisi yang Anda pimpin`;
    return {
      scope: 'division' as DashboardScope,
      where: { AND: [base, { divisionId: { in: leads.map((l) => l.division.id) } }] },
      label,
      leadDivisionIds: leads.map((l) => l.division.id),
    };
  }

  return {
    scope: 'personal' as DashboardScope,
    where: { AND: [base, visibleProjectsWhere(actor), { members: { some: { userId: actor.userId } } }] },
    label: '',
    leadDivisionIds: null,
  };
}

export async function getDashboard(actor: Actor, tz?: string): Promise<DashboardDTO> {
  const zone = safeTimeZone(tz);
  const now = new Date();
  const dayKey = dayKeyIn(zone);
  const clock: Clock = {
    now,
    weekAgo: new Date(now.getTime() - 7 * DAY_MS),
    twoWeeksAgo: new Date(now.getTime() - 14 * DAY_MS),
    weekAhead: new Date(now.getTime() + 7 * DAY_MS),
    today: dayKey(now),
    dayKey,
  };
  const since = new Date(now.getTime() - 30 * DAY_MS);

  const scope = await resolveScope(actor);
  const projects = await prisma.project.findMany({
    where: scope.where,
    select: {
      id: true,
      name: true,
      color: true,
      divisionId: true,
      division: { select: { name: true } },
      _count: { select: { members: true } },
    },
    orderBy: { name: 'asc' },
  });
  const projectIds = projects.map((p) => p.id);
  const liveCard = { archivedAt: null, list: { archivedAt: null } } satisfies Prisma.CardWhereInput;

  const [cards, completedTotals, activityRows, myRows, myTasks] = await Promise.all([
    prisma.card.findMany({
      where: { ...liveCard, projectId: { in: projectIds }, OR: [{ completedAt: null }, { completedAt: { gte: since } }] },
      select: cardRowSelect,
      take: CARD_CAP,
    }),
    prisma.card.groupBy({
      by: ['projectId'],
      where: { ...liveCard, projectId: { in: projectIds }, completedAt: { not: null } },
      _count: { _all: true },
    }),
    prisma.activityLog.findMany({
      where: { projectId: { in: projectIds } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: { ...activityInclude, card: { select: { title: true } }, project: { select: { id: true, name: true, color: true } } },
    }),
    prisma.card.findMany({
      where: {
        ...liveCard,
        assignees: { some: { userId: actor.userId } },
        project: { AND: [visibleProjectsWhere(actor), { archivedAt: null }] },
        OR: [{ completedAt: null }, { completedAt: { gte: since } }],
      },
      select: cardRowSelect,
      take: CARD_CAP,
    }),
    listMyTasks(actor),
  ]);

  // ── per project ──
  const doneByProject = new Map(completedTotals.map((g) => [g.projectId, g._count._all]));
  const byProject = new Map<string, CardRow[]>();
  for (const c of cards) {
    const list = byProject.get(c.projectId) ?? [];
    list.push(c);
    byProject.set(c.projectId, list);
  }
  const projectRows: DashboardProjectRow[] = projects.map((p) => {
    const s = computeStats(byProject.get(p.id) ?? [], clock);
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      divisionName: p.division.name,
      open: s.open,
      overdue: s.overdue,
      completedThisWeek: s.completedThisWeek,
      completedTotal: doneByProject.get(p.id) ?? 0,
      memberCount: p._count.members,
    };
  });
  projectRows.sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));

  // ── priorities (open cards, most urgent first) ──
  const priorityCounts = new Map<Priority, number>(PRIORITIES.map((p) => [p, 0]));
  for (const c of cards) if (!c.completedAt) priorityCounts.set(c.priority, (priorityCounts.get(c.priority) ?? 0) + 1);
  const priorities = [...PRIORITIES].reverse().map((priority) => ({ priority, count: priorityCounts.get(priority) ?? 0 }));

  // ── activity ──
  const activity: DashboardActivityItem[] = activityRows.map((row) => ({
    ...toActivityDTO(row),
    cardTitle: row.card?.title ?? null,
    project: row.project,
  }));

  const [workload, divisions, org] = await Promise.all([
    scope.scope === 'personal' ? null : computeWorkload(actor, scope.leadDivisionIds, cards, clock),
    scope.scope === 'organization' ? computeDivisions(actor, projects, byProject, clock) : null,
    scope.scope === 'organization' ? computeOrgHealth(actor, now) : null,
  ]);

  return {
    scope: scope.scope,
    scopeLabel: scope.scope === 'personal' ? `${projects.length} proyek yang Anda ikuti` : scope.label,
    generatedAt: now.toISOString(),
    personal: { stats: computeStats(myRows, clock), upcoming: pickUpcoming(myTasks) },
    team: {
      stats: computeStats(cards, clock),
      trend: computeTrend(cards, clock),
      priorities,
      projects: projectRows,
      activity,
      workload,
      divisions,
    },
    org,
  };
}

/** Open assigned tasks, overdue first, then by due date; undated last. */
function pickUpcoming(tasks: MyTaskDTO[]): MyTaskDTO[] {
  return tasks
    .filter((t) => !t.completedAt)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    .slice(0, 6);
}

async function computeWorkload(
  actor: Actor,
  leadDivisionIds: string[] | null,
  cards: CardRow[],
  clock: Clock,
): Promise<DashboardWorkloadRow[]> {
  // Everyone in scope is listed (even with nothing assigned), plus anyone assigned work in it.
  const scopeMembers = await prisma.user.findMany({
    where: {
      deactivatedAt: null,
      ...(leadDivisionIds
        ? { divisionMembers: { some: { divisionId: { in: leadDivisionIds } } } }
        : { orgMemberships: { some: { orgId: actor.orgId, role: { not: 'GUEST' } } } }),
    },
    select: { id: true },
  });
  const ids = new Set(scopeMembers.map((u) => u.id));
  for (const c of cards) if (!c.completedAt) for (const a of c.assignees) ids.add(a.userId);

  const users = await prisma.user.findMany({
    where: { id: { in: [...ids] }, deactivatedAt: null },
    select: userSummarySelect,
  });
  const rows = new Map<string, DashboardWorkloadRow>(
    users.map((u) => [u.id, { user: toUserSummary(u), open: 0, overdue: 0, dueThisWeek: 0, urgent: 0, completedThisWeek: 0 }]),
  );
  for (const c of cards) {
    for (const { userId } of c.assignees) {
      const row = rows.get(userId);
      if (!row) continue;
      if (c.completedAt) {
        if (c.completedAt >= clock.weekAgo) row.completedThisWeek++;
        continue;
      }
      row.open++;
      if (c.priority === 'URGENT' || c.priority === 'HIGH') row.urgent++;
      if (c.dueDate) {
        if (c.dueDate < clock.now) row.overdue++;
        else if (c.dueDate <= clock.weekAhead) row.dueThisWeek++;
      }
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.open - a.open || b.overdue - a.overdue || a.user.name.localeCompare(b.user.name),
  );
}

async function computeDivisions(
  actor: Actor,
  projects: { id: string; divisionId: string }[],
  byProject: Map<string, CardRow[]>,
  clock: Clock,
): Promise<DashboardDivisionRow[]> {
  const divisions = await prisma.division.findMany({
    where: { orgId: actor.orgId, archivedAt: null },
    select: { id: true, name: true, color: true, _count: { select: { members: true } } },
    orderBy: { name: 'asc' },
  });
  return divisions.map((d) => {
    const own = projects.filter((p) => p.divisionId === d.id);
    const s = computeStats(own.flatMap((p) => byProject.get(p.id) ?? []), clock);
    return {
      id: d.id,
      name: d.name,
      color: d.color,
      projectCount: own.length,
      memberCount: d._count.members,
      open: s.open,
      overdue: s.overdue,
      completedThisWeek: s.completedThisWeek,
    };
  });
}

async function computeOrgHealth(actor: Actor, now: Date): Promise<DashboardOrgHealth> {
  const inOrg = { orgMemberships: { some: { orgId: actor.orgId } } } satisfies Prisma.UserWhereInput;
  const [activeUsers, deactivatedUsers, unverifiedUsers, guests, pendingInvitations, activeSessions, divisions] = await Promise.all([
    prisma.user.count({ where: { ...inOrg, deactivatedAt: null } }),
    prisma.user.count({ where: { ...inOrg, deactivatedAt: { not: null } } }),
    prisma.user.count({ where: { ...inOrg, deactivatedAt: null, emailVerifiedAt: null } }),
    prisma.orgMember.count({ where: { orgId: actor.orgId, role: 'GUEST', user: { deactivatedAt: null } } }),
    prisma.invitation.count({ where: { orgId: actor.orgId, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } } }),
    prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: now }, user: inOrg } }),
    prisma.division.count({ where: { orgId: actor.orgId, archivedAt: null } }),
  ]);
  return { activeUsers, deactivatedUsers, unverifiedUsers, guests, pendingInvitations, activeSessions, divisions };
}
