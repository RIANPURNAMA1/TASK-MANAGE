import { prisma } from '@nexus/db';
import { isOrgAdmin, type AgentMemoryDTO } from '@nexus/shared';
import type { Actor } from '../access/actor';
import { getDivisionRole, getProjectAccess, visibleProjectsWhere } from '../access/access.service';
import { forbidden } from '../../lib/errors';

export type Scope = AgentMemoryDTO['scope'];

export interface ScopeRef {
  scope: Scope;
  scopeId: string;
}

/**
 * Every (scope, id) pair the actor may READ memories / knowledge from. Computed on the server for
 * each query — the model never decides what it may see (playbook: access filter is mandatory).
 */
export async function readableScopes(actor: Actor): Promise<ScopeRef[]> {
  const [divisions, projects] = await Promise.all([
    prisma.division.findMany({
      where: {
        orgId: actor.orgId,
        archivedAt: null,
        ...(isOrgAdmin(actor.orgRole) ? {} : { members: { some: { userId: actor.userId } } }),
      },
      select: { id: true },
    }),
    prisma.project.findMany({ where: { AND: [visibleProjectsWhere(actor), { archivedAt: null }] }, select: { id: true } }),
  ]);
  return [
    { scope: 'USER', scopeId: actor.userId },
    { scope: 'ORG', scopeId: actor.orgId },
    ...divisions.map((d): ScopeRef => ({ scope: 'DIVISION', scopeId: d.id })),
    ...projects.map((p): ScopeRef => ({ scope: 'PROJECT', scopeId: p.id })),
  ];
}

/** Prisma `where` fragment matching rows in any readable scope of this org. */
export async function readableScopeWhere(actor: Actor) {
  const scopes = await readableScopes(actor);
  return { orgId: actor.orgId, OR: scopes.map((s) => ({ scope: s.scope, scopeId: s.scopeId })) };
}

/**
 * Who may CREATE/APPROVE/DELETE shared (non-USER) entries: org admins for ORG, division leads for
 * DIVISION, project managers for PROJECT. USER scope belongs to its owner only.
 */
export async function requireScopeManager(actor: Actor, scope: Scope, scopeId: string): Promise<void> {
  if (scope === 'USER') {
    if (scopeId !== actor.userId) throw forbidden();
    return;
  }
  if (scope === 'ORG') {
    if (scopeId !== actor.orgId || !isOrgAdmin(actor.orgRole)) throw forbidden();
    return;
  }
  if (scope === 'DIVISION') {
    if (isOrgAdmin(actor.orgRole)) return;
    const found = await getDivisionRole(actor, scopeId);
    if (found?.divisionRole !== 'LEAD') throw forbidden();
    return;
  }
  const found = await getProjectAccess(actor, scopeId);
  if (!found?.access.canManage) throw forbidden();
}

/** Lower-cased word tokens (≥3 chars) used for lightweight relevance matching. */
export function tokens(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
}

/** How many query tokens appear in the text (0 = unrelated). */
export function overlapScore(queryTokens: string[], text: string): number {
  if (queryTokens.length === 0) return 0;
  const haystack = text.toLowerCase();
  let hits = 0;
  for (const t of queryTokens) if (haystack.includes(t)) hits++;
  return hits / queryTokens.length;
}
