import { randomUUID } from 'node:crypto';
import { prisma } from '@nexus/db';
import type { LlmProvider } from '@nexus/agent';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Actor } from '../access/actor';
import { sendMessage } from '../chat/messages.service';
import { overrideProviderForTests } from './agent.config';
import { MENTION_CONTEXT_MESSAGES, messageToTask } from './chat-mention.service';

/**
 * H12 policy tests: @mention of a Team Agent in a project chat. A scripted model stands in for the
 * LLM; these prove who may trigger an agent and what it can see, not how a real model answers.
 */
const tag = `mnt${Date.now().toString(36)}`;
const ids = { org: '', lead: '', viewer: '', guest: '', proj: '', otherProj: '', ch: '', otherCh: '', agent: '', bot: '', strangerBot: '' };
const seenPrompts: string[] = [];

const actor = (userId: string, role: Actor['orgRole'] = 'MEMBER'): Actor => ({ userId, sessionId: 'test', orgId: ids.org, orgRole: role });
const provider: LlmProvider = {
  name: 'ANTHROPIC',
  async complete(req) {
    seenPrompts.push(JSON.stringify(req.messages));
    return { text: 'Halo dari agent', toolCalls: [], usage: { inputTokens: 100, outputTokens: 20 }, stopReason: 'end' };
  },
};

const send = (who: Actor, channelId: string, body: string, mentionIds: string[]) =>
  sendMessage(who, channelId, { clientMessageId: randomUUID(), body, mentionIds } as never);

async function waitFor<T>(fn: () => Promise<T | null | false>, ms = 8000): Promise<T | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
const runCount = () => prisma.agentRun.count({ where: { orgId: ids.org } });

beforeAll(async () => {
  const org = await prisma.organization.create({ data: { name: `Test ${tag}` } });
  ids.org = org.id;
  const mk = async (name: string, role: 'ADMIN' | 'MEMBER' | 'GUEST') =>
    (await prisma.user.create({ data: { name, email: `${name}.${tag}@test.local`, emailVerifiedAt: new Date(), orgMemberships: { create: { orgId: org.id, role } } } })).id;
  ids.lead = await mk('lead', 'MEMBER');
  ids.viewer = await mk('viewer', 'MEMBER');
  ids.guest = await mk('guest', 'GUEST');
  const division = await prisma.division.create({ data: { orgId: org.id, name: `Div ${tag}`, members: { create: [{ userId: ids.lead }] } } });
  const proj = await prisma.project.create({
    data: { divisionId: division.id, name: `P ${tag}`, isPrivate: true, createdById: ids.lead, members: { create: [{ userId: ids.lead, role: 'ADMIN' }, { userId: ids.guest, role: 'MEMBER' }] } },
  });
  const other = await prisma.project.create({ data: { divisionId: division.id, name: `Other ${tag}`, isPrivate: true, createdById: ids.lead, members: { create: [{ userId: ids.lead, role: 'ADMIN' }] } } });
  ids.proj = proj.id;
  ids.otherProj = other.id;
  ids.ch = (await prisma.channel.create({ data: { type: 'PROJECT', projectId: proj.id } })).id;
  ids.otherCh = (await prisma.channel.create({ data: { type: 'PROJECT', projectId: other.id } })).id;

  const mkBot = async (name: string, projectId: string | null) => {
    const bot = await prisma.user.create({ data: { name, email: `${name}.${tag}@agents.invalid`, emailVerifiedAt: new Date(), orgMemberships: { create: { orgId: org.id, role: 'MEMBER' } } } });
    if (projectId) await prisma.projectMember.create({ data: { projectId, userId: bot.id, role: 'MEMBER' } });
    const agent = await prisma.agent.create({ data: { orgId: org.id, name, provider: 'ANTHROPIC', model: 'm', allowedTools: ['tasks:read'], autonomyLevel: 1, botUserId: bot.id, createdById: ids.lead, monthlyBudgetUsd: 50 } });
    return { bot, agent };
  };
  const a = await mkBot('Helper', proj.id);
  ids.agent = a.agent.id;
  ids.bot = a.bot.id;
  ids.strangerBot = (await mkBot('Stranger', null)).bot.id; // not a member of the project
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
  overrideProviderForTests(() => provider);
  seenPrompts.length = 0;
  await prisma.agentRun.deleteMany({ where: { orgId: ids.org } });
  await prisma.message.deleteMany({ where: { channelId: { in: [ids.ch, ids.otherCh] } } });
});

describe('@mention of a Team Agent in project chat', () => {
  it('an editor mentioning the agent starts one run and the bot replies in the channel, once', async () => {
    const sent = await send(actor(ids.lead), ids.ch, 'tolong cek status', [ids.bot]);
    const reply = await waitFor(() => prisma.message.findFirst({ where: { channelId: ids.ch, authorId: ids.bot } }));
    expect(reply?.body).toContain('Halo dari agent');
    expect(reply?.replyToId).toBe(sent.message.id);
    expect(await runCount()).toBe(1);
    // A client retry with the same clientMessageId returns the original and does not trigger again.
    const again = await sendMessage(actor(ids.lead), ids.ch, { clientMessageId: (await prisma.message.findUniqueOrThrow({ where: { id: sent.message.id } })).clientMessageId, body: 'tolong cek status', mentionIds: [ids.bot] } as never);
    expect(again.created).toBe(false);
    await new Promise((r) => setTimeout(r, 300));
    expect(await runCount()).toBe(1);
  });

  it('a non-member, a guest, and another bot cannot trigger it', async () => {
    await expect(send(actor(ids.viewer), ids.ch, 'halo @Helper', [ids.bot])).rejects.toThrow(); // not a project member: cannot even post
    await send(actor(ids.guest, 'GUEST'), ids.ch, 'halo @Helper', [ids.bot]);
    await send(actor(ids.bot), ids.ch, 'saya bot', [ids.bot]);
    await new Promise((r) => setTimeout(r, 500));
    expect(await runCount()).toBe(0);
  });

  it('an agent whose bot is not a project member is not started', async () => {
    await send(actor(ids.lead), ids.ch, 'halo', [ids.strangerBot]);
    await new Promise((r) => setTimeout(r, 500));
    expect(await runCount()).toBe(0);
  });

  it('a deactivated agent is not started', async () => {
    await prisma.agent.update({ where: { id: ids.agent }, data: { isActive: false } });
    await send(actor(ids.lead), ids.ch, 'halo', [ids.bot]);
    await new Promise((r) => setTimeout(r, 500));
    await prisma.agent.update({ where: { id: ids.agent }, data: { isActive: true } });
    expect(await runCount()).toBe(0);
  });

  it('context comes from this channel only and is capped at 30 messages', async () => {
    await prisma.message.create({ data: { channelId: ids.otherCh, authorId: ids.lead, clientMessageId: randomUUID(), body: 'RAHASIA-PROYEK-LAIN' } });
    for (let i = 0; i < MENTION_CONTEXT_MESSAGES + 5; i++) {
      await prisma.message.create({ data: { channelId: ids.ch, authorId: ids.lead, clientMessageId: randomUUID(), body: `pesan-${i}-x` } });
    }
    await send(actor(ids.lead), ids.ch, 'ringkas', [ids.bot]);
    await waitFor(async () => seenPrompts.length > 0);
    const prompt = seenPrompts[0]!;
    expect(prompt).not.toContain('RAHASIA-PROYEK-LAIN');
    expect((prompt.match(/pesan-\d+-x/g) ?? []).length).toBe(MENTION_CONTEXT_MESSAGES);
    expect(prompt).not.toContain('pesan-0-x'); // oldest dropped
    expect(prompt).toContain('<tool_output'); // wrapped as untrusted data
  }, 30_000);
});

describe('"Jadikan task" on an agent reply', () => {
  const botReply = () => prisma.message.create({ data: { channelId: ids.ch, authorId: ids.bot, clientMessageId: randomUUID(), body: ['Rencana kampanye', 'Langkah 1 <b>riset</b>'].join('\n\n') } });
  beforeEach(async () => {
    await prisma.boardList.deleteMany({ where: { projectId: ids.proj } });
    await prisma.boardList.create({ data: { projectId: ids.proj, name: 'To Do', position: 'a0' } });
  });

  it('creates a card assigned to the agent, as the person who clicked', async () => {
    const m = await botReply();
    const { cardId } = await messageToTask(actor(ids.lead), m.id);
    const card = await prisma.card.findUniqueOrThrow({ where: { id: cardId }, include: { assignees: true } });
    expect(card.title).toBe('Rencana kampanye');
    expect(card.createdById).toBe(ids.lead);
    expect(card.assignees.map((a) => a.userId)).toEqual([ids.bot]);
    expect(card.description).not.toContain('<b>'); // agent text is escaped, never rendered as HTML
  });

  it('refuses guests, outsiders, and messages that are not an agent reply', async () => {
    const m = await botReply();
    await expect(messageToTask(actor(ids.guest, 'GUEST'), m.id)).rejects.toThrow();
    await expect(messageToTask(actor(ids.viewer), m.id)).rejects.toThrow(); // not a project member
    const human = await prisma.message.create({ data: { channelId: ids.ch, authorId: ids.lead, clientMessageId: randomUUID(), body: 'oke' } });
    await expect(messageToTask(actor(ids.lead), human.id)).rejects.toThrow();
    expect(await prisma.card.count({ where: { projectId: ids.proj } })).toBe(0);
  });
});
