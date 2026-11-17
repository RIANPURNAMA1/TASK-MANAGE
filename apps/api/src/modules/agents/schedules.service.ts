import { prisma, type AgentSchedule } from '@nexus/db';
import { checkCron, describeCron, extractJsonObject, nextRun, scheduleParsePrompt, DEFAULT_TIMEZONE } from '@nexus/agent';
import type { AgentScheduleDTO, ConfirmScheduleInput, SchedulePreviewDTO } from '@nexus/shared';
import { z } from 'zod';
import type { Actor } from '../access/actor';
import { badRequest, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { agentConfig } from './agent.config';
import { postAgentMessage, startRun } from './runner';

const MAX_PER_USER = 20;
const MAX_PER_ORG = 100;

const parsedSchema = z.object({
  cronExpr: z.string().trim().min(9).max(100),
  timezone: z.string().trim().min(3).max(60).default(DEFAULT_TIMEZONE),
  instruction: z.string().trim().min(3).max(2000),
  summary: z.string().trim().max(300).default(''),
});

function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const toDTO = (s: AgentSchedule): AgentScheduleDTO => ({
  id: s.id,
  naturalText: s.naturalText,
  cronExpr: s.cronExpr,
  humanText: describeCron(s.cronExpr),
  timezone: s.timezone,
  instruction: s.instruction,
  isActive: s.isActive,
  lastRunAt: s.lastRunAt?.toISOString() ?? null,
  nextRunAt: s.nextRunAt?.toISOString() ?? null,
});

/**
 * Step 1 of scheduling: the model turns a sentence into {cron, timezone, instruction}; we validate
 * it and show the human reading plus the next 3 run times. NOTHING is saved here — the user must
 * confirm (step 2).
 */
export async function previewSchedule(actor: Actor, text: string): Promise<SchedulePreviewDTO> {
  const agent = await prisma.personalAgent.findUnique({ where: { userId: actor.userId } });
  if (!agent || !agent.isActive) throw badRequest('Aktifkan Asisten AI dulu di Pengaturan → Asisten AI.');
  if (!(await agentConfig.isProviderAvailable(agent.provider))) throw badRequest('Penyedia LLM Anda belum dikonfigurasi. Minta administrator menambahkan API key di Pengaturan → Asisten AI.');

  const provider = await agentConfig.createProvider(agent.provider);
  const response = await provider.complete({
    model: agent.model,
    system: scheduleParsePrompt(new Date(), agentConfig.timezone).system,
    messages: [{ role: 'user', content: text }],
    tools: [],
    maxTokens: 500,
  });

  let parsed;
  try {
    parsed = parsedSchema.parse(extractJsonObject(response.text));
  } catch {
    throw badRequest('Maaf, saya belum bisa memahami jadwalnya. Coba tulis seperti: "setiap Senin jam 8 pagi ringkas progres proyek X".');
  }
  if (!isValidTimezone(parsed.timezone)) parsed.timezone = DEFAULT_TIMEZONE;
  const check = checkCron(parsed.cronExpr, parsed.timezone);
  if (!check.ok) throw badRequest(check.reason ?? 'Jadwal tidak valid.');
  return {
    cronExpr: parsed.cronExpr,
    timezone: parsed.timezone,
    instruction: parsed.instruction,
    summary: parsed.summary,
    humanText: describeCron(parsed.cronExpr),
    next: check.next.map((d) => d.toISOString()),
  };
}

/** Step 2: the user confirmed the preview. Re-validated server-side (never trust the client's cron). */
export async function confirmSchedule(actor: Actor, input: ConfirmScheduleInput): Promise<AgentScheduleDTO> {
  const agent = await prisma.personalAgent.findUnique({ where: { userId: actor.userId } });
  if (!agent) throw badRequest('Aktifkan Asisten AI dulu.');
  const timezone = input.timezone && isValidTimezone(input.timezone) ? input.timezone : DEFAULT_TIMEZONE;
  const check = checkCron(input.cronExpr, timezone);
  if (!check.ok) throw badRequest(check.reason ?? 'Jadwal tidak valid.');

  const [mine, org] = await Promise.all([
    prisma.agentSchedule.count({ where: { createdById: actor.userId, isActive: true } }),
    prisma.agentSchedule.count({ where: { orgId: actor.orgId, isActive: true } }),
  ]);
  if (mine >= MAX_PER_USER) throw badRequest(`Maksimal ${MAX_PER_USER} jadwal aktif per pengguna.`);
  if (org >= MAX_PER_ORG) throw badRequest(`Maksimal ${MAX_PER_ORG} jadwal aktif per organisasi.`);

  const row = await prisma.agentSchedule.create({
    data: {
      orgId: actor.orgId,
      personalAgentId: agent.id,
      createdById: actor.userId,
      naturalText: input.naturalText,
      cronExpr: input.cronExpr,
      timezone,
      instruction: input.instruction,
      nextRunAt: check.next[0] ?? null,
    },
  });
  return toDTO(row);
}

export async function listSchedules(actor: Actor): Promise<AgentScheduleDTO[]> {
  const rows = await prisma.agentSchedule.findMany({ where: { createdById: actor.userId }, orderBy: { createdAt: 'desc' }, take: 100 });
  return rows.map(toDTO);
}

async function requireSchedule(actor: Actor, id: string): Promise<AgentSchedule> {
  const s = await prisma.agentSchedule.findFirst({ where: { id, createdById: actor.userId } });
  if (!s) throw notFound('Jadwal');
  return s;
}

export async function setScheduleActive(actor: Actor, id: string, isActive: boolean): Promise<AgentScheduleDTO> {
  const s = await requireSchedule(actor, id);
  return toDTO(await prisma.agentSchedule.update({ where: { id }, data: { isActive, nextRunAt: isActive ? nextRun(s.cronExpr, s.timezone) : null } }));
}

/** Deleting the row is enough: the ticker only ever reads active rows, so no orphan jobs remain. */
export async function deleteSchedule(actor: Actor, id: string): Promise<void> {
  await requireSchedule(actor, id);
  await prisma.agentSchedule.delete({ where: { id } });
}

// ─── execution ─────────────────────────────────────────────────────────

/** Where scheduled results go: the owner's most recent Personal Agent conversation (or a new one). */
async function scheduleConversationId(personalAgentId: string): Promise<string> {
  const existing = await prisma.agentConversation.findFirst({ where: { personalAgentId, title: 'Tugas terjadwal' }, select: { id: true } });
  return existing?.id ?? (await prisma.agentConversation.create({ data: { type: 'PERSONAL', personalAgentId, title: 'Tugas terjadwal' } })).id;
}

/** Runs every schedule that is due. Safe to call often; each is claimed before it starts. */
export async function runDueSchedules(now = new Date()): Promise<number> {
  const due = await prisma.agentSchedule.findMany({ where: { isActive: true, nextRunAt: { lte: now } }, take: 25 });
  let started = 0;
  for (const schedule of due) {
    const next = nextRun(schedule.cronExpr, schedule.timezone, now);
    // Claim: only the instance that advances nextRunAt starts the run (no double fire).
    const claimed = await prisma.agentSchedule.updateMany({ where: { id: schedule.id, nextRunAt: schedule.nextRunAt }, data: { lastRunAt: now, nextRunAt: next } });
    if (claimed.count === 0 || !schedule.personalAgentId) continue;
    try {
      const agent = await prisma.personalAgent.findUnique({ where: { id: schedule.personalAgentId } });
      if (!agent?.isActive) continue;
      const conversationId = await scheduleConversationId(agent.id);
      await postAgentMessage(conversationId, schedule.createdById, { role: 'SYSTEM', content: `⏰ Menjalankan tugas terjadwal: ${schedule.naturalText}` });
      await startRun({ orgId: schedule.orgId, userId: schedule.createdById, personalAgentId: agent.id, conversationId, scheduleId: schedule.id, instruction: schedule.instruction });
      started++;
    } catch (err) {
      logger.error({ err, scheduleId: schedule.id }, 'scheduled agent run failed to start');
    }
  }
  return started;
}

let timer: NodeJS.Timeout | null = null;

/** In-process ticker (every minute). Multiple API instances are safe thanks to the claim above. */
export function startScheduleTicker(): void {
  if (timer || !agentConfig.enabled) return;
  timer = setInterval(() => void runDueSchedules().catch((err) => logger.error({ err }, 'schedule tick failed')), 60_000);
  timer.unref();
}
