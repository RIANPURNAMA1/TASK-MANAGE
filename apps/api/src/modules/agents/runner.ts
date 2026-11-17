import { prisma, type AgentRun, type Prisma } from '@nexus/db';
import {
  buildSystemPrompt,
  runAgentLoop,
  sanitizePermissions,
  validateCitations,
  startOfBudgetMonth,
  type LlmMessage,
  type Permission,
  type ProviderName,
} from '@nexus/agent';
import type { AgentMessageDTO, RunStatusName } from '@nexus/shared';
import { realtime } from '../../realtime/emitter';
import { DELEGATION_HINT } from './delegation';
import { logger } from '../../lib/logger';
import { agentConfig } from './agent.config';
import { recallMemories } from './memory.service';
import { pickSkills, recordSkillUsage } from './skills.service';
import './delegation';
import './local-tools';
import { executeTool, offeredTools, resolvePrincipal, type RunEnv } from './tools';

/** In-process kill switches, one per live run. */
const controllers = new Map<string, AbortController>();

/** The persisted identity a run executes as: either a Personal Agent or a Team Agent. */
interface AgentIdentity {
  name: string;
  provider: ProviderName;
  model: string;
  delegated: Permission[];
  autonomy: 0 | 1 | 2;
  monthlyBudgetUsd: number;
  systemPrompt: string | null;
  agentId: string | null;
  personalAgentId: string | null;
  /** Team agents act as their own bot user; Personal Agents act as the owner (null here). */
  botUserId: string | null;
  isActive: boolean;
}

async function loadIdentity(run: AgentRun): Promise<AgentIdentity | null> {
  if (run.personalAgentId) {
    const a = await prisma.personalAgent.findUnique({ where: { id: run.personalAgentId } });
    if (!a) return null;
    return {
      name: 'Asisten Pribadi',
      provider: a.provider,
      model: a.model,
      delegated: sanitizePermissions(a.delegatedPermissions),
      autonomy: 1, // actions on others' data always wait for the owner
      monthlyBudgetUsd: Number(a.monthlyBudgetUsd),
      systemPrompt: null,
      agentId: null,
      personalAgentId: a.id,
      botUserId: null,
      isActive: a.isActive,
    };
  }
  if (run.agentId) {
    const a = await prisma.agent.findUnique({ where: { id: run.agentId } });
    if (!a) return null;
    return {
      name: a.name,
      provider: a.provider,
      model: a.model,
      // Team agents' allowedTools holds permission names (set by an admin).
      delegated: sanitizePermissions(a.allowedTools),
      autonomy: Math.min(2, Math.max(0, a.autonomyLevel)) as 0 | 1 | 2,
      monthlyBudgetUsd: Number(a.monthlyBudgetUsd),
      systemPrompt: a.systemPrompt,
      agentId: a.id,
      personalAgentId: null,
      botUserId: a.botUserId,
      isActive: a.isActive,
    };
  }
  return null;
}

export async function spentThisMonth(where: { personalAgentId?: string; agentId?: string }): Promise<number> {
  const sum = await prisma.agentRun.aggregate({ where: { ...where, createdAt: { gte: startOfBudgetMonth() } }, _sum: { costUsd: true } });
  return Number(sum._sum.costUsd ?? 0);
}

/** Statuses after which a run will not change without a human (the parent may stop waiting). */
const SETTLED: RunStatusName[] = ['COMPLETED', 'NEEDS_REVIEW', 'FAILED', 'CANCELLED', 'AWAITING_APPROVAL'];
const waiters = new Map<string, Set<() => void>>();

/**
 * Resolves when every run has settled or the timeout passes. Event-driven: `finish()` wakes the
 * waiters, so there is no tight polling loop. Returns the ids still unsettled at the end.
 */
export async function waitForRuns(runIds: string[], timeoutMs: number): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rows = await prisma.agentRun.findMany({ where: { id: { in: runIds } }, select: { id: true, status: true } });
    const pending = rows.filter((r) => !SETTLED.includes(r.status)).map((r) => r.id);
    const remaining = deadline - Date.now();
    if (pending.length === 0 || remaining <= 0) return pending;
    await new Promise<void>((resolve) => {
      const wake = () => {
        clearTimeout(timer);
        for (const id of pending) waiters.get(id)?.delete(wake);
        resolve();
      };
      // The timer also bounds the wait if a run finishes on another instance (no event here).
      const timer = setTimeout(wake, Math.min(remaining, 15_000));
      for (const id of pending) (waiters.get(id) ?? waiters.set(id, new Set()).get(id)!).add(wake);
    });
  }
}

function emitRun(run: { id: string; conversationId: string | null; triggeredById: string | null }, status: RunStatusName, label?: string) {
  if (run.triggeredById) realtime.toUser(run.triggeredById, 'agent:run', { conversationId: run.conversationId, runId: run.id, status, label });
}

/** Saves a message in the conversation and pushes it to the owner's open tabs. */
export async function postAgentMessage(
  conversationId: string,
  userId: string,
  data: { role: 'USER' | 'AGENT' | 'SYSTEM'; content: string; runId?: string | null; metadata?: AgentMessageDTO['metadata'] },
): Promise<AgentMessageDTO> {
  const row = await prisma.agentMessage.create({
    data: { conversationId, role: data.role, content: data.content, runId: data.runId ?? null, metadata: (data.metadata ?? undefined) as Prisma.InputJsonValue | undefined },
  });
  await prisma.agentConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  const dto: AgentMessageDTO = {
    id: row.id,
    conversationId,
    role: row.role,
    content: row.content,
    runId: row.runId,
    metadata: (row.metadata as AgentMessageDTO['metadata']) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
  realtime.toUser(userId, 'agent:message', { conversationId, message: dto });
  return dto;
}

/** Called once when a run ends, to deliver the result somewhere other than a Personal Agent conversation (e.g. a project chat). */
export type DeliverResult = (result: { text: string; status: RunStatusName; approvalIds: string[]; warnings: string[] }) => Promise<void>;

export interface StartRunInput {
  orgId: string;
  userId: string;
  instruction: string;
  personalAgentId?: string;
  agentId?: string;
  conversationId?: string;
  scheduleId?: string;
  cardId?: string;
  projectId?: string;
  parentRunId?: string;
  depth?: number;
  /** Earlier turns of the conversation, oldest first (the new instruction is NOT included). */
  history?: LlmMessage[];
  deliver?: DeliverResult;
}

/** Creates the run record and starts it in the background. Returns immediately. */
export async function startRun(input: StartRunInput): Promise<AgentRun> {
  const run = await prisma.agentRun.create({
    data: {
      orgId: input.orgId,
      triggeredById: input.userId,
      instruction: input.instruction,
      personalAgentId: input.personalAgentId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      scheduleId: input.scheduleId,
      cardId: input.cardId,
      projectId: input.projectId,
      parentRunId: input.parentRunId,
      depth: input.depth ?? 0,
    },
  });
  emitRun(run, 'QUEUED');
  void executeRun(run.id, input.history ?? [], input.deliver).catch((err) => logger.error({ err, runId: run.id }, 'agent run crashed'));
  return run;
}

/** Kill switch for one run. Returns false when it isn't running on this instance. */
export function cancelRun(runId: string): boolean {
  const controller = controllers.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

/** Called at boot: runs that were mid-flight when the process died can never finish. */
export async function failInterruptedRuns(): Promise<void> {
  await prisma.agentRun.updateMany({
    where: { status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'FAILED', error: 'Server dimulai ulang saat run berjalan.', finishedAt: new Date() },
  });
}

async function finish(
  run: AgentRun,
  status: RunStatusName,
  patch: Prisma.AgentRunUpdateInput,
  message?: { content: string; metadata?: AgentMessageDTO['metadata'] },
  deliver?: DeliverResult,
) {
  const updated = await prisma.agentRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), ...patch } });
  emitRun(updated, status);
  for (const wake of [...(waiters.get(run.id) ?? [])]) wake();
  waiters.delete(run.id);
  if (deliver && message) {
    await deliver({ text: message.content, status, approvalIds: message.metadata?.approvalIds ?? [], warnings: message.metadata?.warnings ?? [] }).catch((err) => logger.error({ err, runId: run.id }, 'deliver failed'));
  }
  if (run.conversationId && run.triggeredById && message) {
    await postAgentMessage(run.conversationId, run.triggeredById, { role: 'AGENT', content: message.content, runId: run.id, metadata: { status, ...message.metadata } });
  }
}

/** Exported for tests; production code goes through {@link startRun}. */
export async function executeRun(runId: string, history: LlmMessage[], deliver?: DeliverResult): Promise<void> {
  const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: runId } });
  // One logger per run: every line carries the run id, so a run can be traced across log output.
  const log = logger.child({ runId, orgId: run.orgId, parentRunId: run.parentRunId ?? undefined });
  const fail = (error: string) => finish(run, 'FAILED', { error }, { content: `⚠️ ${error}` }, deliver);

  if (!agentConfig.enabled) return fail('Fitur agent dinonaktifkan oleh administrator.');
  if (!run.triggeredById) return fail('Run tanpa pemilik.');

  const identity = await loadIdentity(run);
  if (!identity) return fail('Konfigurasi agent tidak ditemukan.');
  if (!identity.isActive) return fail('Agent ini sedang dinonaktifkan.');
  if (!(await agentConfig.isProviderAvailable(identity.provider))) return fail(`Penyedia ${identity.provider} belum dikonfigurasi. Minta administrator menambahkan API key di Pengaturan → Asisten AI.`);

  const spent = await spentThisMonth(identity.personalAgentId ? { personalAgentId: identity.personalAgentId } : { agentId: identity.agentId! });
  if (spent >= identity.monthlyBudgetUsd) return fail(`Budget bulanan (US$ ${identity.monthlyBudgetUsd.toFixed(2)}) sudah habis. Hubungi administrator atau tunggu bulan depan.`);

  if (run.agentId && !identity.botUserId) return fail('Agent tim ini belum punya akun bot.');

  const env: RunEnv = {
    runId: run.id,
    orgId: run.orgId,
    userId: identity.botUserId ?? run.triggeredById,
    ownerId: run.triggeredById,
    depth: run.depth,
    cardId: run.cardId,
    projectId: run.projectId,
    delegated: identity.delegated,
    autonomy: identity.autonomy,
    agentId: identity.agentId,
    openedUrls: new Set(),
    counters: { search: 0, fetch: 0 },
    limits: { search: 15, fetch: 20 },
    timezone: agentConfig.timezone,
  };
  const principal = await resolvePrincipal(env);
  if (!principal) return fail('Akun agent atau pemiliknya tidak lagi aktif di organisasi.');
  log.info({ agent: identity.name, provider: identity.provider }, 'agent run started');

  const controller = new AbortController();
  controllers.set(run.id, controller);
  try {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'RUNNING', startedAt: new Date() } });
    emitRun(run, 'RUNNING');

    const [user, org, memories, skills] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: run.triggeredById }, select: { name: true } }),
      prisma.organization.findUniqueOrThrow({ where: { id: run.orgId }, select: { name: true } }),
      principal.permissions.has('memory:write') ? recallMemories(principal.actor, run.instruction, 8) : Promise.resolve([]),
      pickSkills(run.orgId, run.instruction, 3),
    ]);

    const system = buildSystemPrompt({
      agentName: identity.name,
      userName: user.name,
      orgName: org.name,
      now: new Date(),
      timezone: agentConfig.timezone,
      memories: memories.map((m) => m.content),
      skills: skills.map((s) => ({ name: s.name, instructions: s.instructions })),
      extra: [identity.systemPrompt, principal.permissions.has('agents:delegate') && run.depth === 0 ? DELEGATION_HINT : null].filter(Boolean).join('\n\n') || null,
    });

    let seq = 0;
    const approvalIds: string[] = [];
    const provider = await agentConfig.createProvider(identity.provider);

    const outcome = await runAgentLoop({
      provider,
      model: identity.model,
      system,
      messages: [...history, { role: 'user', content: run.instruction }],
      tools: offeredTools(principal.permissions, Boolean(run.cardId)),
      maxSteps: agentConfig.maxSteps,
      maxCostUsd: Math.min(agentConfig.maxRunCostUsd, Math.max(0, identity.monthlyBudgetUsd - spent)),
      costOf: (usage) => agentConfig.costOf(identity.provider, identity.model, usage),
      signal: controller.signal,
      executeTool: async (call) => {
        const result = await executeTool(env, call.name, call.input);
        if (result.approvalId) approvalIds.push(result.approvalId);
        return result;
      },
      onStep: async (e) => {
        await prisma.agentStep.create({
          data: {
            runId: run.id,
            seq: seq++,
            type: e.kind === 'llm' ? 'LLM' : 'TOOL',
            toolName: e.toolName,
            input: e.input === undefined ? undefined : (e.input as Prisma.InputJsonValue),
            output: e.output?.slice(0, 20_000),
            isError: Boolean(e.isError),
            inputTokens: e.usage?.inputTokens ?? 0,
            outputTokens: e.usage?.outputTokens ?? 0,
            costUsd: e.costUsd ?? 0,
            durationMs: e.durationMs,
          },
        });
        if (e.kind === 'tool' && e.toolName) emitRun(run, 'RUNNING', e.toolName);
      },
    });

    // Sub-runs' cost counts toward their parent's, so a PM run shows its true total.
    const children = await prisma.agentRun.aggregate({ where: { parentRunId: run.id }, _sum: { costUsd: true } });
    const totals = { inputTokens: outcome.usage.inputTokens, outputTokens: outcome.usage.outputTokens, costUsd: outcome.costUsd + Number(children._sum.costUsd ?? 0) };

    if (outcome.status === 'cancelled') return await finish(run, 'CANCELLED', totals, { content: 'Dihentikan.' }, deliver);
    if (outcome.status === 'error') return await finish(run, 'FAILED', { ...totals, error: outcome.error }, { content: `⚠️ ${outcome.error}` }, deliver);

    // Every cited URL must have been opened in this run; otherwise a person must review it.
    const unverified = validateCitations(outcome.text, env.openedUrls).unverified;
    const warnings = unverified.length ? [`Sumber berikut tidak dibuka agent dalam run ini dan perlu diverifikasi: ${unverified.join(', ')}`] : [];
    const text = outcome.text || (approvalIds.length ? 'Saya menunggu konfirmasi Anda.' : '(Tidak ada jawaban.)');

    if (outcome.status === 'max_steps' || outcome.status === 'budget') {
      return await finish(run, 'NEEDS_REVIEW', { ...totals, result: text, error: outcome.error, warnings }, { content: `${text}\n\n⚠️ ${outcome.error}`, metadata: { approvalIds, warnings } }, deliver);
    }

    await finish(
      run,
      warnings.length ? 'NEEDS_REVIEW' : approvalIds.length ? 'AWAITING_APPROVAL' : 'COMPLETED',
      { ...totals, result: text, warnings },
      { content: text, metadata: { approvalIds: approvalIds.length ? approvalIds : undefined, warnings: warnings.length ? warnings : undefined } },
      deliver,
    );
    await Promise.all(skills.map((s) => recordSkillUsage(s.id, run.id, warnings.length ? 'REVISED' : 'SUCCESS')));
  } catch (err) {
    log.error({ err }, 'agent run failed');
    await fail((err as Error).message || 'Run gagal.');
  } finally {
    controllers.delete(run.id);
  }
}
