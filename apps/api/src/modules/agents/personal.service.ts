import { prisma, type AgentApproval, type PersonalAgent } from '@nexus/db';
import { DEFAULT_DELEGATED, sanitizePermissions, type LlmMessage } from '@nexus/agent';
import {
  ACTIVE_RUN_STATUSES,
  type AgentApprovalDTO,
  type AgentConversationDTO,
  type AgentMessageDTO,
  type AgentRunDTO,
  type AgentStatusDTO,
  type AgentStepDTO,
  type PersonalAgentDTO,
  type SendAgentMessageInput,
  type UpdatePersonalAgentInput,
} from '@nexus/shared';
import type { Actor } from '../access/actor';
import { badRequest, notFound } from '../../lib/errors';
import { agentConfig } from './agent.config';
import { postAgentMessage, spentThisMonth, startRun } from './runner';
import { executeTool, type RunEnv } from './tools';

const HISTORY_MESSAGES = 20;

async function toPersonalDTO(a: PersonalAgent): Promise<PersonalAgentDTO> {
  return {
    isActive: a.isActive,
    provider: a.provider,
    model: a.model,
    delegatedPermissions: sanitizePermissions(a.delegatedPermissions),
    monthlyBudgetUsd: Number(a.monthlyBudgetUsd),
    spentThisMonthUsd: await spentThisMonth({ personalAgentId: a.id }),
  };
}

export async function getAgentStatus(actor: Actor): Promise<AgentStatusDTO> {
  const personal = await prisma.personalAgent.findUnique({ where: { userId: actor.userId } });
  const available = await agentConfig.providers();
  return {
    enabled: agentConfig.enabled,
    providers: await Promise.all(available.map(async (provider) => ({ provider, defaultModel: await agentConfig.defaultModel(provider) }))),
    searchEnabled: agentConfig.search() !== null,
    personal: personal ? await toPersonalDTO(personal) : null,
  };
}

/** Activates (first call) or reconfigures the caller's Personal Agent. */
export async function updatePersonalAgent(actor: Actor, input: UpdatePersonalAgentInput): Promise<PersonalAgentDTO> {
  if (!agentConfig.enabled) throw badRequest('Fitur agent dinonaktifkan oleh administrator.');
  if (input.provider && !(await agentConfig.isProviderAvailable(input.provider))) throw badRequest('Penyedia ini belum dikonfigurasi. Minta administrator menambahkan API key di Pengaturan → Asisten AI.');

  const existing = await prisma.personalAgent.findUnique({ where: { userId: actor.userId } });
  const provider = input.provider ?? existing?.provider ?? (await agentConfig.providers())[0];
  if (!provider) throw badRequest('Belum ada penyedia LLM yang dikonfigurasi. Administrator dapat menambahkan API key di Pengaturan → Asisten AI.');

  const data = {
    provider,
    model: input.model ?? existing?.model ?? (await agentConfig.defaultModel(provider)),
    ...(input.isActive !== undefined && { isActive: input.isActive }),
    ...(input.delegatedPermissions !== undefined && { delegatedPermissions: sanitizePermissions(input.delegatedPermissions) }),
    ...(input.monthlyBudgetUsd !== undefined && { monthlyBudgetUsd: input.monthlyBudgetUsd }),
  };
  const row = existing
    ? await prisma.personalAgent.update({ where: { id: existing.id }, data })
    : await prisma.personalAgent.create({ data: { userId: actor.userId, delegatedPermissions: DEFAULT_DELEGATED, isActive: input.isActive ?? true, ...data } });
  return toPersonalDTO(row);
}

async function requireActivePersonalAgent(actor: Actor): Promise<PersonalAgent> {
  const agent = await prisma.personalAgent.findUnique({ where: { userId: actor.userId } });
  if (!agent || !agent.isActive) throw badRequest('Aktifkan Asisten AI dulu di Pengaturan → Asisten AI.');
  return agent;
}

// ─── conversations ─────────────────────────────────────────────────────

export async function listConversations(actor: Actor, q?: string): Promise<AgentConversationDTO[]> {
  const agent = await prisma.personalAgent.findUnique({ where: { userId: actor.userId }, select: { id: true } });
  if (!agent) return [];
  const rows = await prisma.agentConversation.findMany({
    where: {
      personalAgentId: agent.id,
      ...(q ? { OR: [{ title: { contains: q } }, { messages: { some: { content: { contains: q } } } }] } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 50,
  });
  const busy = new Set(
    (await prisma.agentRun.findMany({ where: { conversationId: { in: rows.map((r) => r.id) }, status: { in: ACTIVE_RUN_STATUSES.filter((s) => s !== 'AWAITING_APPROVAL') } }, select: { conversationId: true } })).map((r) => r.conversationId),
  );
  return rows.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt.toISOString(), busy: busy.has(c.id) }));
}

async function requireConversation(actor: Actor, id: string) {
  const agent = await prisma.personalAgent.findUnique({ where: { userId: actor.userId }, select: { id: true } });
  const conversation = agent && (await prisma.agentConversation.findFirst({ where: { id, personalAgentId: agent.id } }));
  // Someone else's conversation looks exactly like a missing one.
  if (!conversation) throw notFound('Percakapan');
  return conversation;
}

export async function listMessages(actor: Actor, conversationId: string): Promise<AgentMessageDTO[]> {
  await requireConversation(actor, conversationId);
  const rows = await prisma.agentMessage.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 300 });
  return rows.map((m) => ({
    id: m.id,
    conversationId,
    role: m.role,
    content: m.content,
    runId: m.runId,
    metadata: (m.metadata as AgentMessageDTO['metadata']) ?? null,
    createdAt: m.createdAt.toISOString(),
  }));
}

export async function deleteConversation(actor: Actor, id: string): Promise<void> {
  await requireConversation(actor, id);
  await prisma.agentConversation.delete({ where: { id } });
}

/** A user message starts a run; the answer arrives later through the `agent:message` socket event. */
export async function sendMessage(actor: Actor, input: SendAgentMessageInput): Promise<{ conversationId: string; message: AgentMessageDTO; runId: string }> {
  const agent = await requireActivePersonalAgent(actor);

  let conversationId = input.conversationId;
  if (conversationId) await requireConversation(actor, conversationId);
  else conversationId = (await prisma.agentConversation.create({ data: { type: 'PERSONAL', personalAgentId: agent.id, title: input.content.slice(0, 60) } })).id;

  // One run at a time per conversation keeps the transcript coherent.
  const running = await prisma.agentRun.findFirst({ where: { conversationId, status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } });
  if (running) throw badRequest('Agent masih bekerja pada pesan sebelumnya.');

  const earlier = await prisma.agentMessage.findMany({ where: { conversationId, role: { in: ['USER', 'AGENT'] } }, orderBy: { createdAt: 'desc' }, take: HISTORY_MESSAGES });
  const history: LlmMessage[] = earlier.reverse().map((m) => (m.role === 'USER' ? { role: 'user', content: m.content } : { role: 'assistant', content: m.content }));

  const message = await postAgentMessage(conversationId, actor.userId, { role: 'USER', content: input.content });
  const run = await startRun({ orgId: actor.orgId, userId: actor.userId, personalAgentId: agent.id, conversationId, instruction: input.content, history });
  return { conversationId, message, runId: run.id };
}

// ─── approvals (Ya / Tidak buttons) ────────────────────────────────────

const toApprovalDTO = (a: AgentApproval): AgentApprovalDTO => ({
  id: a.id,
  runId: a.runId,
  toolName: a.toolName,
  summary: a.summary,
  risk: a.risk as AgentApprovalDTO['risk'],
  status: a.status,
  createdAt: a.createdAt.toISOString(),
});

export async function listApprovals(actor: Actor, ids?: string[]): Promise<AgentApprovalDTO[]> {
  const rows = await prisma.agentApproval.findMany({
    where: { ownerId: actor.userId, ...(ids ? { id: { in: ids } } : { status: 'PENDING' }) },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(toApprovalDTO);
}

/**
 * Only the person the agent acts for can decide. Approving re-runs the stored call with the
 * owner's rights AS THEY ARE NOW, so a permission revoked since the proposal still blocks it.
 */
export async function decideApproval(actor: Actor, id: string, approve: boolean): Promise<AgentApprovalDTO> {
  const approval = await prisma.agentApproval.findFirst({ where: { id, ownerId: actor.userId }, include: { run: true } });
  if (!approval) throw notFound('Persetujuan');
  if (approval.status !== 'PENDING') throw badRequest('Persetujuan ini sudah diproses.');
  const run = approval.run;

  // Claim it atomically so a double click cannot execute twice.
  const claimed = await prisma.agentApproval.updateMany({
    where: { id, status: 'PENDING' },
    data: { status: approve ? 'APPROVED' : 'REJECTED', decidedById: actor.userId, decidedAt: new Date() },
  });
  if (claimed.count === 0) throw badRequest('Persetujuan ini sudah diproses.');

  let content = approve ? '' : `Dibatalkan: ${approval.summary}`;
  if (approve) {
    const personal = run.personalAgentId ? await prisma.personalAgent.findUnique({ where: { id: run.personalAgentId } }) : null;
    const team = run.agentId ? await prisma.agent.findUnique({ where: { id: run.agentId } }) : null;
    const env: RunEnv = {
      runId: run.id,
      orgId: run.orgId,
      userId: team?.botUserId ?? actor.userId,
      ownerId: actor.userId,
      depth: run.depth,
      cardId: run.cardId,
      projectId: run.projectId,
      delegated: sanitizePermissions(personal?.delegatedPermissions ?? team?.allowedTools ?? []),
      autonomy: 1,
      agentId: run.agentId,
      openedUrls: new Set(),
      counters: { search: 0, fetch: 0 },
      limits: { search: 0, fetch: 0 },
      timezone: agentConfig.timezone,
    };
    const result = await executeTool(env, approval.toolName, approval.input, { approved: true });
    await prisma.agentStep.create({
      data: { runId: run.id, seq: 1000 + Math.floor(Math.random() * 100000), type: 'TOOL', toolName: approval.toolName, input: approval.input as never, output: result.content.slice(0, 20_000), isError: Boolean(result.isError) },
    });
    content = result.isError ? `⚠️ ${result.content}` : `✅ ${result.content}`;
  }

  // The run is finished once nothing is left waiting.
  const pending = await prisma.agentApproval.count({ where: { runId: run.id, status: 'PENDING' } });
  if (pending === 0 && run.status === 'AWAITING_APPROVAL') await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'COMPLETED' } });
  if (run.conversationId) await postAgentMessage(run.conversationId, actor.userId, { role: 'SYSTEM', content, runId: run.id });

  return toApprovalDTO((await prisma.agentApproval.findUniqueOrThrow({ where: { id } })));
}

// ─── runs (timeline, kill switch) ──────────────────────────────────────

export async function getRun(actor: Actor, runId: string): Promise<{ run: AgentRunDTO; steps: AgentStepDTO[] }> {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, orgId: actor.orgId, triggeredById: actor.userId } });
  if (!run) throw notFound('Run');
  const steps = await prisma.agentStep.findMany({ where: { runId }, orderBy: { seq: 'asc' }, take: 200 });
  return {
    run: {
      id: run.id,
      status: run.status,
      instruction: run.instruction,
      result: run.result,
      error: run.error,
      costUsd: Number(run.costUsd),
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      warnings: Array.isArray(run.warnings) ? (run.warnings as string[]) : [],
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    },
    steps: steps.map((s) => ({ seq: s.seq, type: s.type, toolName: s.toolName, input: s.input, output: s.output, isError: s.isError, costUsd: Number(s.costUsd), durationMs: s.durationMs })),
  };
}
