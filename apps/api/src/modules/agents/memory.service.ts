import { prisma, type AgentMemory } from '@nexus/db';
import { checkMemoryContent } from '@nexus/agent';
import type { AgentMemoryDTO, CreateMemoryInput } from '@nexus/shared';
import type { Actor } from '../access/actor';
import { badRequest, notFound } from '../../lib/errors';
import { overlapScore, readableScopeWhere, readableScopes, requireScopeManager, tokens, type Scope } from './scopes';

const toDTO = (m: AgentMemory): AgentMemoryDTO => ({
  id: m.id,
  scope: m.scope,
  scopeId: m.scopeId,
  content: m.content,
  source: m.source,
  status: m.status,
  createdAt: m.createdAt.toISOString(),
});

/**
 * Stores a memory (playbook H6). Rules:
 *  - the text is screened for secrets / personal numbers / instruction-like content;
 *  - USER scope (private to the owner) is ACTIVE straight away;
 *  - PROJECT / DIVISION / ORG entries proposed by an AGENT stay PROPOSED until a manager approves;
 *    when a manager writes them by hand they are ACTIVE.
 */
export async function createMemory(
  actor: Actor,
  input: CreateMemoryInput,
  opts: { source: 'MANUAL' | 'AGENT_PROPOSED'; runId?: string } = { source: 'MANUAL' },
): Promise<AgentMemoryDTO> {
  const verdict = checkMemoryContent(input.content);
  if (!verdict.ok) throw badRequest(verdict.reason);

  const scope = (input.scope ?? 'USER') as Scope;
  const scopeId = input.scopeId ?? (scope === 'USER' ? actor.userId : scope === 'ORG' ? actor.orgId : '');
  if (!scopeId) throw badRequest('scopeId wajib untuk scope PROJECT atau DIVISION.');

  let status: AgentMemory['status'] = 'ACTIVE';
  if (scope !== 'USER') {
    if (opts.source === 'AGENT_PROPOSED') {
      // Anyone who can read the scope may let an agent propose; only a manager can activate it.
      const readable = await readableScopes(actor);
      if (!readable.some((s) => s.scope === scope && s.scopeId === scopeId)) throw notFound('Scope');
      status = 'PROPOSED';
    } else {
      await requireScopeManager(actor, scope, scopeId);
    }
  } else if (scopeId !== actor.userId) {
    throw notFound('Scope');
  }

  const row = await prisma.agentMemory.create({
    data: {
      orgId: actor.orgId,
      scope,
      scopeId,
      content: input.content.trim(),
      source: opts.source,
      status,
      sourceRunId: opts.runId,
      createdById: actor.userId,
    },
  });
  return toDTO(row);
}

/** Memories the actor can manage on screen: their own, plus shared ones they can read. */
export async function listMemories(actor: Actor, filter: { status?: AgentMemory['status'] } = {}): Promise<AgentMemoryDTO[]> {
  const rows = await prisma.agentMemory.findMany({
    where: { ...(await readableScopeWhere(actor)), status: filter.status ?? { in: ['ACTIVE', 'PROPOSED'] } },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  return rows.map(toDTO);
}

async function requireMemory(actor: Actor, id: string): Promise<AgentMemory> {
  const memory = await prisma.agentMemory.findFirst({ where: { id, orgId: actor.orgId } });
  if (!memory) throw notFound('Memori');
  // Reading rights are a prerequisite for managing; a private memory is invisible to others.
  await requireScopeManager(actor, memory.scope, memory.scopeId);
  return memory;
}

export async function updateMemory(actor: Actor, id: string, content: string): Promise<AgentMemoryDTO> {
  const memory = await requireMemory(actor, id);
  const verdict = checkMemoryContent(content);
  if (!verdict.ok) throw badRequest(verdict.reason);
  return toDTO(await prisma.agentMemory.update({ where: { id: memory.id }, data: { content: content.trim() } }));
}

export async function approveMemory(actor: Actor, id: string, approve: boolean): Promise<AgentMemoryDTO> {
  const memory = await requireMemory(actor, id);
  if (memory.status !== 'PROPOSED') throw badRequest('Hanya usulan memori yang bisa disetujui atau ditolak.');
  return toDTO(await prisma.agentMemory.update({ where: { id: memory.id }, data: { status: approve ? 'ACTIVE' : 'ARCHIVED' } }));
}

/** Deletes the row. (When a vector store is added, the vector must be deleted here too.) */
export async function deleteMemory(actor: Actor, id: string): Promise<void> {
  const memory = await requireMemory(actor, id);
  await prisma.agentMemory.delete({ where: { id: memory.id } });
}

/**
 * The most relevant ACTIVE memories for a query, from scopes the actor can read only (server-side
 * filter). Ranking is keyword overlap until a vector store is deployed.
 */
export async function recallMemories(actor: Actor, query: string, limit = 8): Promise<AgentMemory[]> {
  const rows = await prisma.agentMemory.findMany({
    where: { ...(await readableScopeWhere(actor)), status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });
  const q = tokens(query);
  const ranked = rows
    .map((m) => ({ m, score: overlapScore(q, m.content) }))
    // With no query terms (start of a run) fall back to the newest private memories.
    .filter((r) => (q.length === 0 ? r.m.scope === 'USER' : r.score > 0))
    .sort((a, b) => b.score - a.score || b.m.createdAt.getTime() - a.m.createdAt.getTime())
    .slice(0, limit)
    .map((r) => r.m);
  if (ranked.length > 0) await prisma.agentMemory.updateMany({ where: { id: { in: ranked.map((m) => m.id) } }, data: { lastUsedAt: new Date() } });
  return ranked;
}
