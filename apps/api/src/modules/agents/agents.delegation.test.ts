import { prisma } from '@nexus/db';
import type { LlmProvider, LlmResponse } from '@nexus/agent';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../access/actor';
import { overrideProviderForTests } from './agent.config';
import { createTeamAgent, listCardRuns, runTeamAgent, updateTeamAgent } from './team.service';
import { executeRun } from './runner';
import { computeAlerts } from './usage.service';
import { MAX_CHILDREN } from './delegation';
import { executeTool, type RunEnv } from './tools';

/**
 * H11 policy tests (PM Agent & sub-agents) against a real database in an isolated organization.
 * A scripted model stands in for the LLM: these prove OUR limits (depth, fan-out, ownership,
 * who may start an agent), not how a real model plans.
 */
const tag = `dlg${Date.now().toString(36)}`;
const ids = { org: '', admin: '', lead: '', viewer: '', outsider: '', div: '', proj: '', card: '', pm: '', worker: '', pmBot: '', workerBot: '' };

const actor = (userId: string, role: Actor['orgRole'] = 'MEMBER'): Actor => ({ userId, sessionId: 'test', orgId: ids.org, orgRole: role });
const reply = (r: Partial<LlmResponse>): LlmResponse => ({ text: '', toolCalls: [], usage: { inputTokens: 1000, outputTokens: 200 }, stopReason: 'end', ...r });

/** Routes each call to a script by which agent's name is in the system prompt. */
function byAgent(scripts: Record<string, LlmResponse[]>): LlmProvider {
  const cursor: Record<string, number> = {};
  return {
    name: 'ANTHROPIC',
    async complete(req) {
      const who = Object.keys(scripts).find((n) => req.system.includes(`Anda adalah ${n},`));
      if (!who) throw new Error('unexpected agent in system prompt');
      const list = scripts[who]!;
      const i = cursor[who] ?? 0;
      cursor[who] = i + 1;
      return list[Math.min(i, list.length - 1)]!;
    },
  };
}

async function mkAgent(name: string, allowedTools: string[], autonomyLevel: number) {
  const bot = await prisma.user.create({
    data: { name, email: `${name}.${tag}@agents.invalid`, emailVerifiedAt: new Date(), orgMemberships: { create: { orgId: ids.org, role: 'MEMBER' } } },
  });
  await prisma.projectMember.create({ data: { projectId: ids.proj, userId: bot.id } });
  const agent = await prisma.agent.create({
    data: { orgId: ids.org, name, provider: 'ANTHROPIC', model: 'm', allowedTools, autonomyLevel, botUserId: bot.id, createdById: ids.admin, monthlyBudgetUsd: 50 },
  });
  return { agent, bot };
}

const envOf = (run: { id: string }, extra: Partial<RunEnv> = {}): RunEnv => ({
  runId: run.id,
  orgId: ids.org,
  userId: ids.pmBot,
  ownerId: ids.lead,
  depth: 0,
  cardId: ids.card,
  projectId: ids.proj,
  delegated: ['tasks:read', 'agents:delegate'],
  autonomy: 2,
  agentId: ids.pm,
  openedUrls: new Set(),
  counters: { search: 0, fetch: 0 },
  limits: { search: 15, fetch: 20 },
  timezone: 'Asia/Jakarta',
  ...extra,
});

const newRun = (extra: Record<string, unknown> = {}) =>
  prisma.agentRun.create({ data: { orgId: ids.org, triggeredById: ids.lead, agentId: ids.pm, cardId: ids.card, projectId: ids.proj, instruction: 'siapkan kampanye', ...extra } });

beforeAll(async () => {
  const org = await prisma.organization.create({ data: { name: `Test ${tag}` } });
  ids.org = org.id;
  const mk = async (name: string, role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST') =>
    (await prisma.user.create({ data: { name, email: `${name}.${tag}@test.local`, emailVerifiedAt: new Date(), orgMemberships: { create: { orgId: org.id, role } } } })).id;
  ids.admin = await mk('admin', 'ADMIN');
  ids.lead = await mk('lead', 'MEMBER');
  ids.viewer = await mk('viewer', 'GUEST');
  ids.outsider = await mk('outsider', 'MEMBER');

  const division = await prisma.division.create({ data: { orgId: org.id, name: `Div ${tag}`, members: { create: [{ userId: ids.lead }] } } });
  ids.div = division.id;
  const project = await prisma.project.create({ data: { divisionId: division.id, name: `Kampanye ${tag}`, isPrivate: true, createdById: ids.lead, members: { create: [{ userId: ids.lead, role: 'ADMIN' }, { userId: ids.viewer }] } } });
  ids.proj = project.id;
  const list = await prisma.boardList.create({ data: { projectId: project.id, name: 'To Do', position: 'a0' } });
  ids.card = (await prisma.card.create({ data: { projectId: project.id, listId: list.id, title: `Kampanye akhir tahun ${tag}`, createdById: ids.lead, position: 'a0' } })).id;

  const pm = await mkAgent('PMBot', ['tasks:read', 'cards:create', 'agents:delegate'], 2);
  const worker = await mkAgent('Worker', ['tasks:read'], 2);
  ids.pm = pm.agent.id;
  ids.pmBot = pm.bot.id;
  ids.worker = worker.agent.id;
  ids.workerBot = worker.bot.id;
});

afterAll(async () => {
  overrideProviderForTests(null);
  await prisma.agentRun.deleteMany({ where: { orgId: ids.org } });
  await prisma.agent.deleteMany({ where: { orgId: ids.org } });
  await prisma.project.deleteMany({ where: { division: { orgId: ids.org } } });
  await prisma.user.deleteMany({ where: { email: { contains: tag } } });
  await prisma.organization.deleteMany({ where: { id: ids.org } });
});

beforeEach(async () => {
  overrideProviderForTests(null);
  await prisma.agent.updateMany({ where: { orgId: ids.org }, data: { isActive: true } });
  await prisma.agentRun.deleteMany({ where: { orgId: ids.org } });
});

describe('PM Agent → sub-agent end to end', () => {
  it('delegates; the child is its own run at depth 1, owned by the same human, under its own agent', async () => {
    overrideProviderForTests(() =>
      byAgent({
        PMBot: [
          reply({ toolCalls: [{ id: 'a', name: 'start_sub_run', input: { agentName: 'Worker', instruction: 'riset kompetitor kampanye' } }], stopReason: 'tool_use' }),
          reply({ text: 'Selesai: riset sudah dikerjakan Worker.' }),
        ],
        Worker: [reply({ text: 'Hasil riset: 3 kompetitor.' })],
      }),
    );
    const parent = await newRun();
    await executeRun(parent.id, []);

    const children = await prisma.agentRun.findMany({ where: { parentRunId: parent.id } });
    expect(children).toHaveLength(1);
    expect(children[0]!.depth).toBe(1);
    expect(children[0]!.agentId).toBe(ids.worker);
    expect(children[0]!.triggeredById).toBe(ids.lead); // the human stays the owner of every run in the tree

    // The child runs in the background; wait for it to finish.
    const { waitForRuns } = await import('./runner');
    await waitForRuns([children[0]!.id], 15_000);
    const done = await prisma.agentRun.findUniqueOrThrow({ where: { id: children[0]!.id } });
    expect(done.status).toBe('COMPLETED');
    expect(done.result).toContain('3 kompetitor');
    expect(Number(done.costUsd)).toBeGreaterThan(0);
  });

  it('wait_for_runs returns the child result as untrusted data, and only for the run’s own children', async () => {
    const parent = await newRun();
    const child = await newRun({ parentRunId: parent.id, depth: 1, agentId: ids.worker, status: 'COMPLETED', result: 'Draf poster siap.' });
    const stranger = await newRun({ status: 'COMPLETED', result: 'RAHASIA run lain' });

    const out = await executeTool(envOf(parent), 'wait_for_runs', { runIds: [child.id, stranger.id], timeoutSec: 5 });
    expect(out.isError).toBeFalsy();
    expect(out.content).toContain('Draf poster siap.');
    expect(out.content).toContain('<tool_output');
    expect(out.content).not.toContain('RAHASIA run lain');

    const none = await executeTool(envOf(parent), 'wait_for_runs', { runIds: [stranger.id], timeoutSec: 5 });
    expect(none.content).toMatch(/Tidak ada sub-run/);
  });
});

describe('limits are enforced by the server', () => {
  it('a sub-run may not start another run (depth 2 only)', async () => {
    const parent = await newRun();
    const child = await newRun({ parentRunId: parent.id, depth: 1, agentId: ids.worker });
    const out = await executeTool(envOf(child, { depth: 1, agentId: ids.worker, userId: ids.workerBot }), 'start_sub_run', { agentName: 'PMBot', instruction: 'buat cucu run' });
    expect(out.content).toMatch(/tidak boleh menyerahkan/);
    expect(await prisma.agentRun.count({ where: { parentRunId: child.id } })).toBe(0);
  });

  it(`caps a parent at ${MAX_CHILDREN} sub-runs`, async () => {
    const parent = await newRun();
    for (let i = 0; i < MAX_CHILDREN; i++) await newRun({ parentRunId: parent.id, depth: 1, agentId: ids.worker, status: 'COMPLETED' });
    const out = await executeTool(envOf(parent), 'start_sub_run', { agentName: 'Worker', instruction: 'satu lagi tolong' });
    expect(out.content).toMatch(/batas \d+ sub-run/);
    expect(await prisma.agentRun.count({ where: { parentRunId: parent.id } })).toBe(MAX_CHILDREN);
  });

  it('refuses unknown or deactivated agents and self-delegation', async () => {
    const parent = await newRun();
    expect((await executeTool(envOf(parent), 'start_sub_run', { agentName: 'TidakAda', instruction: 'kerjakan sesuatu' })).content).toMatch(/tidak ditemukan/);
    expect((await executeTool(envOf(parent), 'start_sub_run', { agentName: 'PMBot', instruction: 'kerjakan sendiri' })).content).toMatch(/dirinya sendiri/);
    await prisma.agent.update({ where: { id: ids.worker }, data: { isActive: false } });
    expect((await executeTool(envOf(parent), 'start_sub_run', { agentName: 'Worker', instruction: 'kerjakan sesuatu' })).content).toMatch(/tidak aktif/);
  });

  it('without the agents:delegate permission the tools are refused', async () => {
    const parent = await newRun();
    const out = await executeTool(envOf(parent, { delegated: ['tasks:read'] }), 'start_sub_run', { agentName: 'Worker', instruction: 'kerjakan sesuatu' });
    expect(out.isError).toBe(true);
    expect(out.content).toMatch(/Izin/);
  });

  it('at autonomy 1 delegating waits for the owner instead of starting the child', async () => {
    const parent = await newRun();
    const out = await executeTool(envOf(parent, { autonomy: 1 }), 'start_sub_run', { agentName: 'Worker', instruction: 'kerjakan sesuatu' });
    expect(out.approvalId).toBeTruthy();
    expect(await prisma.agentRun.count({ where: { parentRunId: parent.id } })).toBe(0);
  });
});

describe('who may start a Team Agent', () => {
  it('a project member can; a guest (even a project member) and an outsider cannot', async () => {
    overrideProviderForTests(() => byAgent({ PMBot: [reply({ text: 'ok' })] }));
    const started = await runTeamAgent(actor(ids.lead), ids.pm, { instruction: 'ringkas kartu ini', cardId: ids.card });
    expect(started.runId).toBeTruthy();
    const { waitForRuns } = await import('./runner');
    await waitForRuns([started.runId], 15_000);

    await expect(runTeamAgent(actor(ids.viewer, 'GUEST'), ids.pm, { instruction: 'ringkas kartu ini', cardId: ids.card })).rejects.toThrow(/Tamu/);
    await expect(runTeamAgent(actor(ids.outsider), ids.pm, { instruction: 'ringkas kartu ini', cardId: ids.card })).rejects.toThrow();
    await expect(runTeamAgent(actor(ids.lead), ids.pm, { instruction: 'ringkas', projectId: undefined })).rejects.toThrow(/kartu atau proyek/);
  });

  it('a deactivated agent cannot be started', async () => {
    await prisma.agent.update({ where: { id: ids.pm }, data: { isActive: false } });
    await expect(runTeamAgent(actor(ids.lead), ids.pm, { instruction: 'ringkas kartu ini', cardId: ids.card })).rejects.toThrow(/dinonaktifkan/);
  });
});

describe('Team Agent administration', () => {
  it('only admins create or change agents; creation also makes a login-less bot account', async () => {
    const input = { name: `Riset${tag}`, provider: 'ANTHROPIC' as const, model: 'm', allowedTools: ['tasks:read' as const] };
    overrideProviderForTests(() => byAgent({}));
    await expect(createTeamAgent(actor(ids.lead), input)).rejects.toThrow();
    await expect(updateTeamAgent(actor(ids.lead), ids.pm, { isActive: false })).rejects.toThrow();

    const created = await createTeamAgent(actor(ids.admin, 'ADMIN'), input);
    expect(created.botUser?.email).toMatch(/@agents\.invalid$/);
    const bot = await prisma.user.findUniqueOrThrow({ where: { id: created.botUser!.id } });
    expect(bot.passwordHash).toBeNull();
    expect(bot.googleId).toBeNull();
    await expect(createTeamAgent(actor(ids.admin, 'ADMIN'), input)).rejects.toThrow(/Sudah ada/);
  });

  it('sanitizes allowedTools to known permissions', async () => {
    const updated = await updateTeamAgent(actor(ids.admin, 'ADMIN'), ids.worker, { allowedTools: ['tasks:read', 'root:everything' as never] }).catch((e: Error) => e);
    // Unknown permission names are rejected by validation, never stored.
    expect(updated).toBeInstanceOf(Error);
    expect((await prisma.agent.findUniqueOrThrow({ where: { id: ids.worker } })).allowedTools).toEqual(['tasks:read']);
  });
});

describe('run tree on a card', () => {
  it('shows team-agent runs to card viewers but keeps other people’s Personal Agent runs private', async () => {
    const parent = await newRun();
    await newRun({ parentRunId: parent.id, depth: 1, agentId: ids.worker });
    const personal = await prisma.personalAgent.create({ data: { userId: ids.admin, model: 'm', delegatedPermissions: [] } });
    await prisma.agentRun.create({ data: { orgId: ids.org, triggeredById: ids.admin, personalAgentId: personal.id, cardId: ids.card, instruction: 'rahasia admin' } });

    const runs = await listCardRuns(actor(ids.lead), ids.card);
    expect(runs.map((r) => r.agentName).sort()).toEqual(['PMBot', 'Worker']);
    expect(runs.find((r) => r.parentRunId)?.agentName).toBe('Worker');
    expect(JSON.stringify(runs)).not.toContain('rahasia admin');
    await expect(listCardRuns(actor(ids.outsider), ids.card)).rejects.toThrow();
    await prisma.personalAgent.delete({ where: { id: personal.id } });
  });
});

describe('usage alerts', () => {
  it('flags a cost spike, a failure spike, and budgets above 80%', () => {
    const alerts = computeAlerts({
      todayCostUsd: 12,
      dailyCostLimitUsd: 10,
      recentRuns: 10,
      recentFailed: 6,
      budgets: [
        { name: 'A', spentUsd: 4.5, budgetUsd: 5 },
        { name: 'B', spentUsd: 1, budgetUsd: 5 },
        { name: 'C', spentUsd: 6, budgetUsd: 5 },
      ],
    });
    const msgs = alerts.map((a) => `${a.level}:${a.message}`).join('\n');
    expect(msgs).toMatch(/critical:Biaya agent hari ini/);
    expect(msgs).toMatch(/critical:6 dari 10 run/);
    expect(msgs).toMatch(/warning:A sudah memakai 90%/);
    expect(msgs).toMatch(/critical:C sudah memakai 120%/);
    expect(msgs).not.toMatch(/B sudah/);
  });

  it('stays quiet when everything is normal, and ignores tiny samples', () => {
    expect(computeAlerts({ todayCostUsd: 1, dailyCostLimitUsd: 10, recentRuns: 3, recentFailed: 3, budgets: [{ name: 'A', spentUsd: 1, budgetUsd: 5 }] })).toEqual([]);
  });
});
