import { randomUUID } from 'node:crypto';
import { prisma, Prisma, type Agent, type User } from '@nexus/db';
import { sanitizePermissions } from '@nexus/agent';
import type { CardAgentRunDTO, CreateTeamAgentInput, TeamAgentDTO, UpdateTeamAgentInput } from '@nexus/shared';
import { createTeamAgentSchema, updateTeamAgentSchema } from '@nexus/shared';
import type { Actor } from '../access/actor';
import { requireCard, requireDivision, requireOrgAdmin, requireProject } from '../access/access.service';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { agentConfig } from './agent.config';
import { spentThisMonth, startRun } from './runner';

async function toDTO(a: Agent, bot: Pick<User, 'id' | 'name' | 'email'> | null): Promise<TeamAgentDTO> {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    divisionId: a.divisionId,
    provider: a.provider,
    model: a.model,
    systemPrompt: a.systemPrompt,
    autonomyLevel: Math.min(2, Math.max(0, a.autonomyLevel)) as 0 | 1 | 2,
    allowedTools: sanitizePermissions(a.allowedTools),
    monthlyBudgetUsd: Number(a.monthlyBudgetUsd),
    spentThisMonthUsd: await spentThisMonth({ agentId: a.id }),
    isActive: a.isActive,
    botUser: bot,
  };
}

const botSelect = { id: true, name: true, email: true } as const;

async function withBots(agents: Agent[]): Promise<TeamAgentDTO[]> {
  const botIds = agents.map((a) => a.botUserId).filter((x): x is string => Boolean(x));
  const bots = new Map((await prisma.user.findMany({ where: { id: { in: botIds } }, select: botSelect })).map((u) => [u.id, u]));
  return Promise.all(agents.map((a) => toDTO(a, a.botUserId ? bots.get(a.botUserId) ?? null : null)));
}

/** Everyone in the org can see which agents exist (to know whom to ask); only admins change them. */
export async function listTeamAgents(actor: Actor): Promise<TeamAgentDTO[]> {
  const agents = await prisma.agent.findMany({ where: { orgId: actor.orgId }, orderBy: { name: 'asc' }, take: 200 });
  return withBots(agents);
}

/**
 * Creates the agent AND its own account in one transaction. The account has no password and no
 * login, so nobody can sign in as the agent; it gets access only by being added to projects.
 */
export async function createTeamAgent(actor: Actor, raw: CreateTeamAgentInput): Promise<TeamAgentDTO> {
  requireOrgAdmin(actor);
  if (!agentConfig.enabled) throw badRequest('Fitur agent dinonaktifkan oleh administrator.');
  const input = createTeamAgentSchema.parse(raw);
  if (!(await agentConfig.isProviderAvailable(input.provider))) throw badRequest('Penyedia ini belum dikonfigurasi. Minta administrator menambahkan API key di Pengaturan → Asisten AI.');
  if (input.divisionId) await requireDivision(actor, input.divisionId, 'view');

  try {
    return await prisma.$transaction(async (tx) => {
      const bot = await tx.user.create({
        data: {
          name: input.name,
          email: `agent-${randomUUID()}@agents.invalid`,
          emailVerifiedAt: new Date(),
          emailDigest: 'OFF',
          orgMemberships: { create: { orgId: actor.orgId, role: 'MEMBER' } },
        },
        select: botSelect,
      });
      const agent = await tx.agent.create({
        data: {
          orgId: actor.orgId,
          divisionId: input.divisionId,
          name: input.name,
          description: input.description,
          provider: input.provider,
          model: input.model,
          systemPrompt: input.systemPrompt,
          autonomyLevel: input.autonomyLevel,
          allowedTools: sanitizePermissions(input.allowedTools),
          monthlyBudgetUsd: input.monthlyBudgetUsd,
          botUserId: bot.id,
          createdById: actor.userId,
        },
      });
      return toDTO(agent, bot);
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('Sudah ada agent dengan nama itu.');
    throw err;
  }
}

export async function updateTeamAgent(actor: Actor, id: string, raw: UpdateTeamAgentInput): Promise<TeamAgentDTO> {
  requireOrgAdmin(actor);
  const input = updateTeamAgentSchema.parse(raw);
  const existing = await prisma.agent.findFirst({ where: { id, orgId: actor.orgId } });
  if (!existing) throw notFound('Agent');
  if (input.provider && !(await agentConfig.isProviderAvailable(input.provider))) throw badRequest('Penyedia ini belum dikonfigurasi. Minta administrator menambahkan API key di Pengaturan → Asisten AI.');

  const row = await prisma.agent.update({
    where: { id },
    data: {
      ...(input.description !== undefined && { description: input.description }),
      ...(input.provider !== undefined && { provider: input.provider }),
      ...(input.model !== undefined && { model: input.model }),
      ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
      ...(input.autonomyLevel !== undefined && { autonomyLevel: input.autonomyLevel }),
      ...(input.allowedTools !== undefined && { allowedTools: sanitizePermissions(input.allowedTools) }),
      ...(input.monthlyBudgetUsd !== undefined && { monthlyBudgetUsd: input.monthlyBudgetUsd }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    },
  });
  return (await withBots([row]))[0]!;
}

/**
 * A person starts a Team Agent on a project/card. Only someone who can already edit that project
 * may do so (never a viewer or an outsider); the agent then works with ITS OWN access.
 * Anything it wants to change waits for this person's confirmation unless the agent is at level 2.
 */
export async function runTeamAgent(actor: Actor, agentId: string, input: { instruction: string; cardId?: string; projectId?: string }): Promise<{ runId: string }> {
  // Same rule as for Personal Agents: guests read, they never cause writes through an agent.
  if (actor.orgRole === 'GUEST') throw forbidden('Tamu tidak dapat menjalankan agent.');
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: actor.orgId } });
  if (!agent) throw notFound('Agent');
  if (!agent.isActive) throw badRequest('Agent ini sedang dinonaktifkan.');
  if (!input.cardId && !input.projectId) throw badRequest('Pilih kartu atau proyek tempat agent bekerja.');

  let projectId = input.projectId;
  if (input.cardId) projectId = (await requireCard(actor, input.cardId, 'canEdit')).entity.projectId;
  else await requireProject(actor, projectId!, 'canEdit');

  const run = await startRun({ orgId: actor.orgId, userId: actor.userId, instruction: input.instruction, agentId: agent.id, cardId: input.cardId, projectId });
  return { runId: run.id };
}

/** Team-agent runs on a card (parents + sub-runs) plus the caller's own; other people's Personal Agent runs stay private. */
export async function listCardRuns(actor: Actor, cardId: string): Promise<CardAgentRunDTO[]> {
  await requireCard(actor, cardId, 'canView');
  const runs = await prisma.agentRun.findMany({ where: { orgId: actor.orgId, cardId, OR: [{ agentId: { not: null } }, { triggeredById: actor.userId }] }, orderBy: { createdAt: 'asc' }, take: 100 });
  const agentIds = [...new Set(runs.map((r) => r.agentId).filter((x): x is string => Boolean(x)))];
  const names = new Map((await prisma.agent.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true } })).map((a) => [a.id, a.name]));
  return runs.map((r) => ({
    id: r.id,
    parentRunId: r.parentRunId,
    agentName: r.agentId ? names.get(r.agentId) ?? 'Agent' : 'Asisten Pribadi',
    status: r.status,
    instruction: r.instruction,
    result: r.result,
    costUsd: Number(r.costUsd),
    createdAt: r.createdAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
  }));
}
