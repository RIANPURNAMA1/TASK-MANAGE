import { prisma } from '@nexus/db';
import { isOrgAdmin, type AgentUsageDTO } from '@nexus/shared';
import type { Actor } from '../access/actor';
import { forbidden } from '../../lib/errors';
import { cancelRun } from './runner';

/** Admins see the whole org; Division Leads are allowed too (they review their divisions' agents). */
async function requireUsageViewer(actor: Actor): Promise<void> {
  if (isOrgAdmin(actor.orgRole)) return;
  const lead = await prisma.divisionMember.count({ where: { userId: actor.userId, role: 'LEAD', division: { orgId: actor.orgId } } });
  if (lead === 0) throw forbidden('Dashboard AI hanya untuk Admin dan Division Lead.');
}

const DAILY_COST_ALERT_USD = Number(process.env.AGENT_DAILY_COST_ALERT_USD ?? 10);
const FAILURE_SPIKE_MIN_RUNS = 5;
type Alert = AgentUsageDTO['alerts'][number];

/** Pure so it can be tested: numbers in, human-readable warnings out (playbook H13.2). */
export function computeAlerts(input: {
  todayCostUsd: number;
  recentRuns: number;
  recentFailed: number;
  budgets: { name: string; spentUsd: number; budgetUsd: number }[];
  dailyCostLimitUsd?: number;
}): Alert[] {
  const alerts: Alert[] = [];
  const limit = input.dailyCostLimitUsd ?? DAILY_COST_ALERT_USD;
  if (limit > 0 && input.todayCostUsd > limit) {
    alerts.push({ level: 'critical', message: `Biaya agent hari ini (perkiraan US$ ${input.todayCostUsd.toFixed(2)}) melewati ambang US$ ${limit.toFixed(2)}.` });
  }
  if (input.recentRuns >= FAILURE_SPIKE_MIN_RUNS) {
    const rate = input.recentFailed / input.recentRuns;
    if (rate >= 0.3) {
      alerts.push({ level: rate >= 0.5 ? 'critical' : 'warning', message: `${input.recentFailed} dari ${input.recentRuns} run 24 jam terakhir gagal (${Math.round(rate * 100)}%).` });
    }
  }
  for (const b of input.budgets) {
    if (b.budgetUsd <= 0) continue;
    const used = b.spentUsd / b.budgetUsd;
    if (used >= 0.8) {
      alerts.push({ level: used >= 1 ? 'critical' : 'warning', message: `${b.name} sudah memakai ${Math.round(used * 100)}% budget bulanan (US$ ${b.spentUsd.toFixed(2)} dari US$ ${b.budgetUsd.toFixed(2)}).` });
    }
  }
  return alerts;
}

/** Alerts describe the present, so they are only computed for the current month. */
async function currentAlerts(orgId: string, todayCostUsd: number, monthStart: Date): Promise<Alert[]> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [recentRuns, recentFailed, personal, team, spentRows] = await Promise.all([
    prisma.agentRun.count({ where: { orgId, createdAt: { gte: since } } }),
    prisma.agentRun.count({ where: { orgId, createdAt: { gte: since }, status: 'FAILED' } }),
    prisma.personalAgent.findMany({
      where: { isActive: true, user: { orgMemberships: { some: { orgId } } } },
      select: { id: true, monthlyBudgetUsd: true, user: { select: { name: true } } },
    }),
    prisma.agent.findMany({ where: { orgId, isActive: true }, select: { id: true, name: true, monthlyBudgetUsd: true } }),
    prisma.agentRun.groupBy({ by: ['personalAgentId', 'agentId'], where: { orgId, createdAt: { gte: monthStart } }, _sum: { costUsd: true } }),
  ]);
  const spent = new Map<string, number>();
  for (const r of spentRows) {
    const key = r.personalAgentId ?? r.agentId;
    if (key) spent.set(key, (spent.get(key) ?? 0) + Number(r._sum.costUsd ?? 0));
  }
  return computeAlerts({
    todayCostUsd,
    recentRuns,
    recentFailed,
    budgets: [
      ...personal.map((p) => ({ name: `Asisten pribadi ${p.user.name}`, spentUsd: spent.get(p.id) ?? 0, budgetUsd: Number(p.monthlyBudgetUsd) })),
      ...team.map((a) => ({ name: `Agent ${a.name}`, spentUsd: spent.get(a.id) ?? 0, budgetUsd: Number(a.monthlyBudgetUsd) })),
    ],
  });
}

function monthRange(month?: string): { from: Date; to: Date; label: string } {
  const match = month && /^(\d{4})-(\d{2})$/.exec(month);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const m = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(year, m, 1));
  return { from, to: new Date(Date.UTC(year, m + 1, 1)), label: `${year}-${String(m + 1).padStart(2, '0')}` };
}

/**
 * Cost, reliability and tool usage for one month (playbook H13). Costs are summed from the runs'
 * recorded token usage × configured prices, so they are ESTIMATES — the same numbers the budget
 * guard uses, which keeps the dashboard and the limits consistent.
 */
export async function getUsage(actor: Actor, month?: string): Promise<AgentUsageDTO> {
  await requireUsageViewer(actor);
  const { from, to, label } = monthRange(month);
  const runs = await prisma.agentRun.findMany({
    where: { orgId: actor.orgId, createdAt: { gte: from, lt: to } },
    select: { id: true, createdAt: true, startedAt: true, finishedAt: true, costUsd: true, status: true, triggeredById: true, _count: { select: { steps: true } } },
    take: 20_000,
  });

  const byDay = new Map<string, { costUsd: number; runs: number }>();
  const byUser = new Map<string, { costUsd: number; runs: number }>();
  let total = 0;
  let steps = 0;
  let durations = 0;
  let timed = 0;
  for (const r of runs) {
    const cost = Number(r.costUsd);
    total += cost;
    steps += r._count.steps;
    const day = r.createdAt.toISOString().slice(0, 10);
    const d = byDay.get(day) ?? { costUsd: 0, runs: 0 };
    byDay.set(day, { costUsd: d.costUsd + cost, runs: d.runs + 1 });
    if (r.triggeredById) {
      const u = byUser.get(r.triggeredById) ?? { costUsd: 0, runs: 0 };
      byUser.set(r.triggeredById, { costUsd: u.costUsd + cost, runs: u.runs + 1 });
    }
    if (r.startedAt && r.finishedAt) {
      durations += (r.finishedAt.getTime() - r.startedAt.getTime()) / 1000;
      timed++;
    }
  }

  const users = await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, name: true } });
  const names = new Map(users.map((u) => [u.id, u.name]));

  const toolRows = await prisma.agentStep.groupBy({
    by: ['toolName', 'isError'],
    where: { type: 'TOOL', toolName: { not: null }, run: { orgId: actor.orgId, createdAt: { gte: from, lt: to } } },
    _count: { _all: true },
  });
  const tools = new Map<string, { calls: number; failures: number }>();
  for (const row of toolRows) {
    const t = tools.get(row.toolName!) ?? { calls: 0, failures: 0 };
    t.calls += row._count._all;
    if (row.isError) t.failures += row._count._all;
    tools.set(row.toolName!, t);
  }

  const skills = await prisma.agentSkill.findMany({ where: { orgId: actor.orgId, status: 'APPROVED' }, include: { usages: { select: { outcome: true } } }, take: 100 });

  const isCurrent = label === monthRange().label;
  const today = new Date().toISOString().slice(0, 10);
  const alerts = isCurrent ? await currentAlerts(actor.orgId, byDay.get(today)?.costUsd ?? 0, from) : [];

  const count = (s: string) => runs.filter((r) => r.status === s).length;
  return {
    month: label,
    totalCostUsd: total,
    runs: runs.length,
    completed: count('COMPLETED'),
    needsReview: count('NEEDS_REVIEW'),
    failed: count('FAILED'),
    avgSteps: runs.length ? steps / runs.length : 0,
    avgDurationSec: timed ? durations / timed : 0,
    byDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
    byUser: [...byUser.entries()].map(([userId, v]) => ({ userId, name: names.get(userId) ?? '(dihapus)', ...v })).sort((a, b) => b.costUsd - a.costUsd),
    topTools: [...tools.entries()].map(([toolName, v]) => ({ toolName, ...v })).sort((a, b) => b.calls - a.calls).slice(0, 10),
    skills: skills
      .map((s) => ({ id: s.id, name: s.name, uses: s.usages.length, successRate: s.usages.length ? s.usages.filter((u) => u.outcome === 'SUCCESS').length / s.usages.length : null }))
      .sort((a, b) => (b.successRate ?? -1) - (a.successRate ?? -1)),
    alerts,
    isEstimate: true,
  };
}

/** Org-wide emergency stop (org admins): cancels every run that is still active. */
export async function cancelAllRuns(actor: Actor): Promise<number> {
  if (!isOrgAdmin(actor.orgRole)) throw forbidden();
  const active = await prisma.agentRun.findMany({ where: { orgId: actor.orgId, status: { in: ['QUEUED', 'RUNNING', 'WAITING'] } }, select: { id: true } });
  let stopped = 0;
  for (const run of active) if (cancelRun(run.id)) stopped++;
  // Runs owned by another instance (or already between steps) are marked directly.
  await prisma.agentRun.updateMany({ where: { id: { in: active.map((r) => r.id) }, status: { in: ['QUEUED', 'WAITING'] } }, data: { status: 'CANCELLED', finishedAt: new Date() } });
  return active.length;
}
