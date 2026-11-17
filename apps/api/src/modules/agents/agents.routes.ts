import { prisma } from '@nexus/db';
import {
  AGENT_PROVIDERS,
  confirmScheduleSchema,
  createMemorySchema,
  saveSkillSchema,
  scheduleTextSchema,
  createTeamAgentSchema,
  sendAgentMessageSchema,
  updateTeamAgentSchema,
  updateMemorySchema,
  runTeamAgentSchema,
  updatePersonalAgentSchema,
  upsertAgentProviderSchema,
  updateScheduleSchema,
} from '@nexus/shared';
import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { notFound } from '../../lib/errors';
import { actorOf, param, parseBody, parseQuery } from '../../lib/http';
import { createLimiter, tooManyRequests } from '../../lib/rate-limit';
import { RateLimiterRes } from 'rate-limiter-flexible';
import { reportLocalResult } from './local-tools';
import { messageToTask } from './chat-mention.service';
import { createKnowledgeDoc, createKnowledgeSchema, deleteKnowledgeDoc, listKnowledgeDocs } from './knowledge.service';
import { approveMemory, createMemory, deleteMemory, listMemories, updateMemory } from './memory.service';
import {
  decideApproval,
  deleteConversation,
  getAgentStatus,
  getRun,
  listApprovals,
  listConversations,
  listMessages,
  sendMessage,
  updatePersonalAgent,
} from './personal.service';
import { cancelRun } from './runner';
import { deleteProviderSetting, listProviderSettings, saveProviderSetting } from './provider-config.service';
import { createTeamAgent, listCardRuns, listTeamAgents, runTeamAgent, updateTeamAgent } from './team.service';
import { confirmSchedule, deleteSchedule, listSchedules, previewSchedule, setScheduleActive } from './schedules.service';
import { createSkill, deleteSkill, listSkills, proposeNewVersion, reflectOnRun, reviewSkill } from './skills.service';
import { cancelAllRuns, getUsage } from './usage.service';

export const agentsRouter = Router();

/** Each message can spend real money, so it gets its own tight per-user limit. */
const messageLimiter = createLimiter('agent-message', 20, 60);
const expensiveLimiter = createLimiter('agent-expensive', 10, 60);
const perUser =
  (limiter: ReturnType<typeof createLimiter>): RequestHandler =>
  async (req, _res, next) => {
    try {
      await limiter.consume(actorOf(req).userId);
      next();
    } catch (err) {
      if (err instanceof RateLimiterRes) throw tooManyRequests(err.msBeforeNext / 1000);
      throw err;
    }
  };

agentsRouter.get('/agents/status', async (req, res) => res.json(await getAgentStatus(actorOf(req))));
agentsRouter.patch('/agents/personal', async (req, res) => res.json(await updatePersonalAgent(actorOf(req), parseBody(updatePersonalAgentSchema, req))));

// Admin: LLM provider API keys + default models (Settings → Asisten AI). Keys are encrypted at rest.
agentsRouter.get('/agents/providers', async (req, res) => res.json(await listProviderSettings(actorOf(req))));
agentsRouter.put('/agents/providers/:provider', async (req, res) => {
  const provider = z.enum(AGENT_PROVIDERS).parse(param(req, 'provider'));
  res.json(await saveProviderSetting(actorOf(req), provider, parseBody(upsertAgentProviderSchema, req)));
});
agentsRouter.delete('/agents/providers/:provider', async (req, res) => {
  await deleteProviderSetting(actorOf(req), z.enum(AGENT_PROVIDERS).parse(param(req, 'provider')));
  res.status(204).end();
});

// Conversations & chat
agentsRouter.get('/agents/conversations', async (req, res) => {
  const { q } = parseQuery(z.object({ q: z.string().trim().max(100).optional() }), req);
  res.json(await listConversations(actorOf(req), q));
});
agentsRouter.get('/agents/conversations/:id/messages', async (req, res) => res.json(await listMessages(actorOf(req), param(req, 'id'))));
agentsRouter.delete('/agents/conversations/:id', async (req, res) => {
  await deleteConversation(actorOf(req), param(req, 'id'));
  res.status(204).end();
});
agentsRouter.post('/agents/messages', perUser(messageLimiter), async (req, res) => {
  res.status(202).json(await sendMessage(actorOf(req), parseBody(sendAgentMessageSchema, req)));
});

// Approvals (Ya / Tidak)
agentsRouter.get('/agents/approvals', async (req, res) => {
  const { ids } = parseQuery(z.object({ ids: z.string().max(2000).optional() }), req);
  res.json(await listApprovals(actorOf(req), ids ? ids.split(',').filter(Boolean).slice(0, 50) : undefined));
});
agentsRouter.post('/agents/approvals/:id/approve', async (req, res) => res.json(await decideApproval(actorOf(req), param(req, 'id'), true)));
agentsRouter.post('/agents/approvals/:id/reject', async (req, res) => res.json(await decideApproval(actorOf(req), param(req, 'id'), false)));

// Runs
agentsRouter.get('/agents/runs/:id', async (req, res) => res.json(await getRun(actorOf(req), param(req, 'id'))));
agentsRouter.post('/agents/runs/:id/cancel', async (req, res) => {
  const actor = actorOf(req);
  const run = await prisma.agentRun.findFirst({ where: { id: param(req, 'id'), orgId: actor.orgId, triggeredById: actor.userId } });
  if (!run) throw notFound('Run');
  if (!cancelRun(run.id) && ['QUEUED', 'RUNNING', 'WAITING', 'AWAITING_APPROVAL'].includes(run.status)) {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: 'CANCELLED', finishedAt: new Date() } });
  }
  res.status(202).json({ ok: true });
});
agentsRouter.post('/agents/runs/:id/reflect', perUser(expensiveLimiter), async (req, res) => res.json({ skill: await reflectOnRun(actorOf(req), param(req, 'id')) }));
agentsRouter.post('/agents/admin/cancel-all', async (req, res) => res.json({ cancelled: await cancelAllRuns(actorOf(req)) }));

// Memory
agentsRouter.get('/agents/memories', async (req, res) => res.json(await listMemories(actorOf(req))));
agentsRouter.post('/agents/memories', async (req, res) => res.status(201).json(await createMemory(actorOf(req), parseBody(createMemorySchema, req))));
agentsRouter.patch('/agents/memories/:id', async (req, res) => res.json(await updateMemory(actorOf(req), param(req, 'id'), parseBody(updateMemorySchema, req).content)));
agentsRouter.post('/agents/memories/:id/approve', async (req, res) => res.json(await approveMemory(actorOf(req), param(req, 'id'), true)));
agentsRouter.post('/agents/memories/:id/reject', async (req, res) => res.json(await approveMemory(actorOf(req), param(req, 'id'), false)));
agentsRouter.delete('/agents/memories/:id', async (req, res) => {
  await deleteMemory(actorOf(req), param(req, 'id'));
  res.status(204).end();
});

// Knowledge base
agentsRouter.get('/agents/knowledge', async (req, res) => res.json(await listKnowledgeDocs(actorOf(req))));
agentsRouter.post('/agents/knowledge', async (req, res) => res.status(201).json(await createKnowledgeDoc(actorOf(req), parseBody(createKnowledgeSchema, req))));
agentsRouter.delete('/agents/knowledge/:id', async (req, res) => {
  await deleteKnowledgeDoc(actorOf(req), param(req, 'id'));
  res.status(204).end();
});

// Schedules
agentsRouter.get('/agents/schedules', async (req, res) => res.json(await listSchedules(actorOf(req))));
agentsRouter.post('/agents/schedules/preview', perUser(expensiveLimiter), async (req, res) => res.json(await previewSchedule(actorOf(req), parseBody(scheduleTextSchema, req).text)));
agentsRouter.post('/agents/schedules', async (req, res) => res.status(201).json(await confirmSchedule(actorOf(req), parseBody(confirmScheduleSchema, req))));
agentsRouter.patch('/agents/schedules/:id', async (req, res) => res.json(await setScheduleActive(actorOf(req), param(req, 'id'), parseBody(updateScheduleSchema, req).isActive)));
agentsRouter.delete('/agents/schedules/:id', async (req, res) => {
  await deleteSchedule(actorOf(req), param(req, 'id'));
  res.status(204).end();
});

// Skills
const reviewSchema = z.object({ action: z.enum(['approve', 'disable', 'enable', 'reject']) });
agentsRouter.get('/agents/skills', async (req, res) => res.json(await listSkills(actorOf(req))));
agentsRouter.post('/agents/skills', async (req, res) => res.status(201).json(await createSkill(actorOf(req), parseBody(saveSkillSchema, req))));
agentsRouter.post('/agents/skills/:id/review', async (req, res) => res.json(await reviewSkill(actorOf(req), param(req, 'id'), parseBody(reviewSchema, req).action)));
agentsRouter.post('/agents/skills/:id/version', async (req, res) => res.status(201).json(await proposeNewVersion(actorOf(req), param(req, 'id'), parseBody(saveSkillSchema, req))));
agentsRouter.delete('/agents/skills/:id', async (req, res) => {
  await deleteSkill(actorOf(req), param(req, 'id'));
  res.status(204).end();
});

// Usage dashboard (H13)
agentsRouter.get('/agents/usage', async (req, res) => {
  const { month } = parseQuery(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }), req);
  res.json(await getUsage(actorOf(req), month));
});

// Team agents (H11): admins manage them; project editors can start them; card viewers see the run tree.
agentsRouter.get('/agents/team', async (req, res) => res.json(await listTeamAgents(actorOf(req))));
agentsRouter.post('/agents/team', async (req, res) => res.status(201).json(await createTeamAgent(actorOf(req), parseBody(createTeamAgentSchema, req))));
agentsRouter.patch('/agents/team/:id', async (req, res) => res.json(await updateTeamAgent(actorOf(req), param(req, 'id'), parseBody(updateTeamAgentSchema, req))));
agentsRouter.post('/agents/team/:id/runs', perUser(messageLimiter), async (req, res) => res.status(202).json(await runTeamAgent(actorOf(req), param(req, 'id'), parseBody(runTeamAgentSchema, req))));
agentsRouter.post('/agents/local-actions/:approvalId/result', async (req, res) => {
  await reportLocalResult(actorOf(req), param(req, 'approvalId'), parseBody(z.object({ ok: z.boolean(), message: z.string().max(1000) }), req));
  res.status(204).end();
});
agentsRouter.post('/agents/chat-messages/:id/make-task', async (req, res) => res.status(201).json(await messageToTask(actorOf(req), param(req, 'id'))));
agentsRouter.get('/agents/cards/:cardId/runs', async (req, res) => res.json(await listCardRuns(actorOf(req), param(req, 'cardId'))));
