import { prisma, type AgentSkill, type SkillUsage } from '@nexus/db';
import { extractJsonObject, type LlmMessage } from '@nexus/agent';
import { isOrgAdmin, type AgentSkillDTO, type SaveSkillInput } from '@nexus/shared';
import { z } from 'zod';
import type { Actor } from '../access/actor';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { agentConfig } from './agent.config';
import { overlapScore, tokens } from './scopes';

type SkillWithUsage = AgentSkill & { usages: Pick<SkillUsage, 'outcome'>[] };

function toDTO(s: SkillWithUsage): AgentSkillDTO {
  const uses = s.usages.length;
  const ok = s.usages.filter((u) => u.outcome === 'SUCCESS').length;
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    instructions: s.instructions,
    status: s.status,
    version: s.version,
    successRate: uses ? ok / uses : null,
    uses,
    createdAt: s.createdAt.toISOString(),
  };
}

/** Org admins and division leads curate the skill library. */
async function isSkillManager(actor: Actor): Promise<boolean> {
  if (isOrgAdmin(actor.orgRole)) return true;
  return (await prisma.divisionMember.count({ where: { userId: actor.userId, role: 'LEAD', division: { orgId: actor.orgId } } })) > 0;
}

async function requireSkillManager(actor: Actor): Promise<void> {
  if (!(await isSkillManager(actor))) throw forbidden('Hanya admin atau Division Lead yang mengelola library skill.');
}

/** Managers see everything (to review proposals); everyone else only approved skills. */
export async function listSkills(actor: Actor): Promise<AgentSkillDTO[]> {
  const manager = await isSkillManager(actor);
  const rows = await prisma.agentSkill.findMany({
    where: { orgId: actor.orgId, ...(manager ? {} : { status: 'APPROVED' }) },
    include: { usages: { select: { outcome: true } } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
  return rows.map(toDTO);
}

/** Proposed skills are NEVER loaded into a prompt; only APPROVED ones, ranked by relevance. */
export async function pickSkills(orgId: string, query: string, limit = 3): Promise<AgentSkill[]> {
  const q = tokens(query);
  if (q.length === 0) return [];
  const skills = await prisma.agentSkill.findMany({ where: { orgId, status: 'APPROVED' }, take: 200 });
  return skills
    .map((s) => ({ s, score: overlapScore(q, `${s.name} ${s.description}`) }))
    .filter((r) => r.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.s);
}

export async function recordSkillUsage(skillId: string, runId: string, outcome: 'SUCCESS' | 'FAILED' | 'REVISED'): Promise<void> {
  await prisma.skillUsage.create({ data: { skillId, runId, outcome } });
}

export async function createSkill(actor: Actor, input: SaveSkillInput, opts: { sourceRunId?: string } = {}): Promise<AgentSkillDTO> {
  const manager = await isSkillManager(actor);
  const row = await prisma.agentSkill.create({
    // A manager writing one by hand is the approval; anyone else (or an agent) only proposes.
    data: { orgId: actor.orgId, ...input, status: manager && !opts.sourceRunId ? 'APPROVED' : 'PROPOSED', sourceRunId: opts.sourceRunId, approvedById: manager && !opts.sourceRunId ? actor.userId : null },
    include: { usages: { select: { outcome: true } } },
  });
  return toDTO(row);
}

async function requireSkill(actor: Actor, id: string): Promise<AgentSkill> {
  await requireSkillManager(actor);
  const skill = await prisma.agentSkill.findFirst({ where: { id, orgId: actor.orgId } });
  if (!skill) throw notFound('Skill');
  return skill;
}

/**
 * Approve / disable / edit. Editing an APPROVED skill creates a new PROPOSED version and leaves the
 * current one active until the new one is approved (playbook H10 step 4).
 */
export async function reviewSkill(actor: Actor, id: string, action: 'approve' | 'disable' | 'enable' | 'reject'): Promise<AgentSkillDTO> {
  const skill = await requireSkill(actor, id);
  const data =
    action === 'approve'
      ? { status: 'APPROVED' as const, approvedById: actor.userId }
      : action === 'enable'
        ? { status: 'APPROVED' as const }
        : { status: 'DISABLED' as const };
  if (action === 'approve' && skill.status !== 'PROPOSED') throw badRequest('Hanya usulan yang bisa disetujui.');
  const updated = await prisma.$transaction(async (tx) => {
    // Approving a new version retires the one it replaces.
    if (action === 'approve' && skill.supersedesId) await tx.agentSkill.updateMany({ where: { id: skill.supersedesId }, data: { status: 'DISABLED' } });
    return tx.agentSkill.update({ where: { id }, data, include: { usages: { select: { outcome: true } } } });
  });
  return toDTO(updated);
}

export async function proposeNewVersion(actor: Actor, id: string, input: SaveSkillInput): Promise<AgentSkillDTO> {
  const skill = await requireSkill(actor, id);
  const row = await prisma.agentSkill.create({
    data: { orgId: actor.orgId, ...input, status: 'PROPOSED', version: skill.version + 1, supersedesId: skill.id },
    include: { usages: { select: { outcome: true } } },
  });
  return toDTO(row);
}

export async function deleteSkill(actor: Actor, id: string): Promise<void> {
  await requireSkill(actor, id);
  await prisma.agentSkill.delete({ where: { id } });
}

const reflectionSchema = z.object({
  reusable: z.boolean(),
  name: z.string().trim().min(3).max(120).optional(),
  description: z.string().trim().min(10).max(1000).optional(),
  instructions: z.string().trim().min(10).max(4000).optional(),
});

/**
 * Reflection (playbook H10): after a run that COMPLETED cleanly, ask the model whether it produced
 * a reusable procedure. At most one proposal per run, never for failed / review-needed runs, and
 * never when it largely duplicates an existing skill. The result is only PROPOSED.
 */
export async function reflectOnRun(actor: Actor, runId: string): Promise<AgentSkillDTO | null> {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, orgId: actor.orgId, triggeredById: actor.userId } });
  if (!run) throw notFound('Run');
  if (run.status !== 'COMPLETED') throw badRequest('Refleksi hanya untuk run yang selesai tanpa catatan.');
  if (await prisma.agentSkill.findFirst({ where: { sourceRunId: runId }, select: { id: true } })) throw badRequest('Run ini sudah menghasilkan usulan skill.');

  const identity = run.personalAgentId
    ? await prisma.personalAgent.findUnique({ where: { id: run.personalAgentId }, select: { provider: true, model: true } })
    : run.agentId
      ? await prisma.agent.findUnique({ where: { id: run.agentId }, select: { provider: true, model: true } })
      : null;
  if (!identity || !(await agentConfig.isProviderAvailable(identity.provider))) throw badRequest('Penyedia LLM untuk run ini tidak tersedia.');

  const steps = await prisma.agentStep.findMany({ where: { runId, type: 'TOOL' }, orderBy: { seq: 'asc' }, take: 30, select: { toolName: true, isError: true } });
  const messages: LlmMessage[] = [
    {
      role: 'user',
      content: [
        'Tinjau run agent berikut dan tentukan apakah ada PROSEDUR yang bisa dipakai ulang.',
        `Permintaan: ${run.instruction}`,
        `Tool yang dipakai berurutan: ${steps.map((s) => `${s.toolName}${s.isError ? '(gagal)' : ''}`).join(' → ') || '-'}`,
        `Hasil akhir: ${(run.result ?? '').slice(0, 1500)}`,
        'Balas HANYA JSON: {"reusable": boolean, "name": string, "description": "kapan skill ini dipakai", "instructions": "langkah, kriteria kualitas, kesalahan yang dihindari"}. Jika tidak ada pola yang berguna, {"reusable": false}.',
      ].join('\n'),
    },
  ];
  const provider = await agentConfig.createProvider(identity.provider);
  const response = await provider.complete({
    model: identity.model,
    system: 'Anda menyusun skill prosedural singkat dari pengalaman. Jangan memasukkan data pribadi, rahasia, atau isi spesifik klien.',
    messages,
    tools: [],
    maxTokens: 900,
  });

  let parsed;
  try {
    parsed = reflectionSchema.parse(extractJsonObject(response.text));
  } catch {
    return null;
  }
  if (!parsed.reusable || !parsed.name || !parsed.description || !parsed.instructions) return null;

  // Skip near-duplicates of existing skills.
  const q = tokens(`${parsed.name} ${parsed.description}`);
  const existing = await prisma.agentSkill.findMany({ where: { orgId: actor.orgId, status: { in: ['APPROVED', 'PROPOSED'] } }, select: { name: true, description: true } });
  if (existing.some((s) => overlapScore(q, `${s.name} ${s.description}`) >= 0.7)) return null;

  const row = await prisma.agentSkill.create({
    data: { orgId: actor.orgId, name: parsed.name, description: parsed.description, instructions: parsed.instructions, status: 'PROPOSED', sourceRunId: runId },
    include: { usages: { select: { outcome: true } } },
  });
  return toDTO(row);
}
