import { prisma } from '@nexus/db';
import {
  assertPublicUrl,
  effectivePermissions,
  fetchPage,
  normalizeUrl,
  wrapUntrusted,
  type Permission,
  type ToolRisk,
  type ToolSpec,
} from '@nexus/agent';
import { z } from 'zod';
import { stripHtml } from '../../lib/sanitize';
import type { Actor } from '../access/actor';
import { getProjectAccess, requireCard, requireProject, visibleProjectsWhere } from '../access/access.service';
import { listMyTasks } from '../board/my-tasks.service';
import { createCard, setAssignees, updateCard } from '../board/cards.service';
import { createComment } from '../comments/comments.service';
import { agentConfig } from './agent.config';
import { searchKnowledge } from './knowledge.service';
import { createMemory, recallMemories } from './memory.service';

/** Per-run state shared by all tool calls of that run. */
export interface RunEnv {
  runId: string;
  orgId: string;
  /**
   * The account whose rights apply to every data access, re-checked on each call: the owner for a
   * Personal Agent, the agent's own bot user for a Team Agent (its project memberships = its RBAC).
   */
  userId: string;
  /** The human who started the run and who must confirm writes. Same as `userId` for Personal Agents. */
  ownerId: string;
  /** Nesting level: 0 = top-level run, 1 = sub-run (may not start further runs). */
  depth: number;
  cardId: string | null;
  projectId: string | null;
  /** Permissions delegated to this agent (Personal: owner's choice; Team: admin's allowedTools mapping). */
  delegated: Permission[];
  /** 0/1: changes need confirmation; 2: internal changes run directly. External is always confirmed. */
  autonomy: 0 | 1 | 2;
  agentId: string | null;
  openedUrls: Set<string>;
  counters: { search: number; fetch: number };
  limits: { search: number; fetch: number };
  timezone: string;
}

export interface Principal {
  actor: Actor;
  permissions: Set<Permission>;
}

/**
 * Re-reads the owner's CURRENT state: still active, still in the org, role now. Called for every
 * tool call so revoking someone's access (or deactivating them) cuts their agent off at once.
 */
export async function resolvePrincipal(env: RunEnv): Promise<Principal | null> {
  const member = await prisma.orgMember.findFirst({
    where: { orgId: env.orgId, userId: env.userId, user: { deactivatedAt: null } },
    select: { role: true },
  });
  if (!member) return null;
  const guest = member.role === 'GUEST';
  // Guests may read and search but never write on their own behalf.
  const owner: Permission[] = guest
    ? ['tasks:read', 'web:read', 'knowledge:read', 'memory:write']
    : ['tasks:read', 'cards:create', 'comments:write', 'web:read', 'knowledge:read', 'memory:write', 'agents:delegate', 'github:read', 'github:write', 'local:act'];
  return {
    actor: { userId: env.userId, sessionId: 'agent', orgId: env.orgId, orgRole: member.role },
    permissions: effectivePermissions(owner, env.delegated),
  };
}

export interface AgentTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  spec: ToolSpec;
  risk: ToolRisk;
  /** Coarse capability required; null = none (access is still checked per resource). */
  permission: Permission | null;
  /** Private to the owner, so safe to run without confirmation (own memory, own plan items). */
  selfScoped?: boolean;
  /** Only offered when the run is attached to a card. */
  needsCard?: boolean;
  schema: S;
  /** One-line, human description of what will happen — shown on the confirmation button. */
  summarize(input: z.infer<S>): string;
  run(input: z.infer<S>, ctx: { env: RunEnv; principal: Principal }): Promise<string>;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });
const dayKey = (d: Date, tz: string) => d.toLocaleDateString('sv-SE', { timeZone: tz });
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const toHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');

function taskLine(t: { id: string; title: string; dueDate: string | null; completedAt: string | null; priority: string; project: { id: string; name: string }; list: { name: string } }, tz: string) {
  const due = t.dueDate ? dayKey(new Date(t.dueDate), tz) : 'tanpa tenggat';
  return `- [${t.id}] ${t.title} | proyek: ${t.project.name} (${t.project.id}) | kolom: ${t.list.name} | tenggat: ${due} | prioritas: ${t.priority}${t.completedAt ? ' | SELESAI' : ''}`;
}

const TOOLS: AgentTool[] = [
  {
    spec: { name: 'find_projects', description: 'Cari proyek yang bisa diakses pengguna (untuk mendapatkan projectId). Kosongkan query untuk daftar semua.', inputSchema: obj({ query: { type: 'string', description: 'Sebagian nama proyek' } }) },
    risk: 'read',
    permission: 'tasks:read',
    schema: z.object({ query: z.string().max(100).optional() }),
    summarize: () => 'Mencari proyek',
    async run(input, { principal }) {
      const projects = await prisma.project.findMany({
        where: { AND: [visibleProjectsWhere(principal.actor), { archivedAt: null }, input.query ? { name: { contains: input.query } } : {}] },
        select: { id: true, name: true, division: { select: { name: true } } },
        orderBy: { name: 'asc' },
        take: 40,
      });
      return wrapUntrusted('workbase', projects.map((p) => `- ${p.name} (${p.id}) — divisi ${p.division.name}`).join('\n') || 'Tidak ada proyek.');
    },
  },
  {
    spec: {
      name: 'list_my_tasks',
      description: 'Daftar task yang ditugaskan ke pengguna. filter: overdue (terlambat), today (jatuh tempo hari ini), this_week (7 hari ke depan), open (semua yang belum selesai), by_project (wajib projectId).',
      inputSchema: obj({ filter: { type: 'string', enum: ['overdue', 'today', 'this_week', 'open', 'by_project'] }, projectId: { type: 'string' } }, ['filter']),
    },
    risk: 'read',
    permission: 'tasks:read',
    schema: z.object({ filter: z.enum(['overdue', 'today', 'this_week', 'open', 'by_project']), projectId: z.string().max(40).optional() }),
    summarize: (i) => `Membaca task (${i.filter})`,
    async run(input, { env, principal }) {
      const now = new Date();
      const today = dayKey(now, env.timezone);
      const weekAhead = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
      // `listMyTasks` already applies the visibility rules (only the user's own, visible projects).
      const all = (await listMyTasks(principal.actor)).filter((t) => !t.completedAt);
      const filtered = all.filter((t) => {
        if (input.filter === 'by_project') return t.projectId === input.projectId;
        if (input.filter === 'open') return true;
        if (!t.dueDate) return false;
        const due = new Date(t.dueDate);
        if (input.filter === 'overdue') return due < now;
        if (input.filter === 'today') return dayKey(due, env.timezone) === today;
        return due >= now && due <= weekAhead;
      });
      const lines = filtered.slice(0, 50).map((t) => taskLine(t, env.timezone));
      const header = `${filtered.length} task${filtered.length > 50 ? ' (50 pertama ditampilkan)' : ''}:`;
      return wrapUntrusted('workbase', filtered.length ? `${header}\n${lines.join('\n')}` : 'Tidak ada task yang cocok.');
    },
  },
  {
    spec: { name: 'summarize_project', description: 'Ringkasan data sebuah proyek: jumlah kartu per kolom, yang terlambat, selesai 7 hari terakhir, belum ditugaskan, dan daftar kartu aktif.', inputSchema: obj({ projectId: { type: 'string' } }, ['projectId']) },
    risk: 'read',
    permission: 'tasks:read',
    schema: z.object({ projectId: z.string().min(1).max(40) }),
    summarize: () => 'Membaca ringkasan proyek',
    async run(input, { env, principal }) {
      const { project } = await requireProject(principal.actor, input.projectId, 'canView');
      const now = new Date();
      const cards = await prisma.card.findMany({
        where: { projectId: input.projectId, archivedAt: null, list: { archivedAt: null } },
        select: { id: true, title: true, dueDate: true, completedAt: true, priority: true, list: { select: { name: true } }, assignees: { select: { userId: true } } },
        take: 1000,
      });
      const open = cards.filter((c) => !c.completedAt);
      const perList = new Map<string, number>();
      for (const c of open) perList.set(c.list.name, (perList.get(c.list.name) ?? 0) + 1);
      const overdue = open.filter((c) => c.dueDate && c.dueDate < now);
      const doneWeek = cards.filter((c) => c.completedAt && c.completedAt >= new Date(now.getTime() - 7 * 24 * 3600 * 1000));
      const lines = open
        .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity))
        .slice(0, 25)
        .map((c) => `- [${c.id}] ${c.title} | ${c.list.name} | tenggat: ${c.dueDate ? dayKey(c.dueDate, env.timezone) : '-'}`);
      return wrapUntrusted(
        'workbase',
        [
          `Proyek: ${project.name}`,
          `Kartu aktif: ${open.length} | terlambat: ${overdue.length} | selesai 7 hari: ${doneWeek.length} | belum ditugaskan: ${open.filter((c) => c.assignees.length === 0).length}`,
          `Per kolom: ${[...perList.entries()].map(([n, c]) => `${n}=${c}`).join(', ') || '-'}`,
          'Kartu aktif (25 teratas menurut tenggat):',
          ...lines,
        ].join('\n'),
      );
    },
  },
  {
    spec: { name: 'get_card', description: 'Baca detail satu kartu: judul, kolom, tenggat, assignee, deskripsi, dan komentar terakhir.', inputSchema: obj({ cardId: { type: 'string' } }, ['cardId']) },
    risk: 'read',
    permission: 'tasks:read',
    schema: z.object({ cardId: z.string().min(1).max(40) }),
    summarize: () => 'Membaca detail kartu',
    async run(input, { env, principal }) {
      const { entity } = await requireCard(principal.actor, input.cardId, 'canView');
      const card = await prisma.card.findUniqueOrThrow({
        where: { id: entity.id },
        include: {
          list: { select: { name: true } },
          project: { select: { name: true } },
          assignees: { select: { user: { select: { name: true } } } },
          comments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 5, select: { body: true, author: { select: { name: true } } } },
          checklist: { select: { title: true, isDone: true }, take: 30 },
        },
      });
      return wrapUntrusted(
        'workbase',
        [
          `Judul: ${card.title}`,
          `Proyek: ${card.project.name} | Kolom: ${card.list.name} | Prioritas: ${card.priority}`,
          `Tenggat: ${card.dueDate ? dayKey(card.dueDate, env.timezone) : '-'} | Selesai: ${card.completedAt ? 'ya' : 'belum'}`,
          `Assignee: ${card.assignees.map((a) => a.user.name).join(', ') || '-'}`,
          `Deskripsi: ${stripHtml(card.description ?? '').slice(0, 1500) || '-'}`,
          `Checklist: ${card.checklist.map((c) => `${c.isDone ? '[x]' : '[ ]'} ${c.title}`).join('; ') || '-'}`,
          `Komentar terakhir:\n${card.comments.map((c) => `- ${c.author.name}: ${stripHtml(c.body).slice(0, 300)}`).join('\n') || '-'}`,
        ].join('\n'),
      );
    },
  },
  {
    spec: {
      name: 'create_card_draft',
      description: 'Usulkan pembuatan kartu baru. Kartu TIDAK dibuat sebelum pengguna menyetujui. Gunakan find_projects untuk projectId.',
      inputSchema: obj({ projectId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, listName: { type: 'string', description: 'Nama kolom; default kolom pertama' }, assigneeUserId: { type: 'string', description: 'ID pengguna/agent yang ditugaskan (opsional)' }, dueDate: { type: 'string', description: 'ISO 8601 dengan zona waktu (opsional)' } }, ['projectId', 'title']),
    },
    risk: 'internal_write',
    permission: 'cards:create',
    schema: z.object({
      projectId: z.string().min(1).max(40),
      title: z.string().trim().min(1).max(255),
      description: z.string().max(5000).optional(),
      listName: z.string().max(100).optional(),
      /** User id (or an agent's bot user id) to assign. */
      assigneeUserId: z.string().max(40).optional(),
      dueDate: z.string().datetime({ offset: true }).optional(),
    }),
    summarize: (i) => `Buat kartu “${i.title}”`,
    async run(input, { principal }) {
      const { project } = await requireProject(principal.actor, input.projectId, 'canEdit');
      const lists = await prisma.boardList.findMany({ where: { projectId: input.projectId, archivedAt: null }, select: { id: true, name: true, position: true } });
      if (lists.length === 0) return 'Proyek ini belum punya kolom.';
      const sorted = lists.sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0));
      const list = (input.listName && sorted.find((l) => l.name.toLowerCase() === input.listName!.toLowerCase())) || sorted[0]!;
      const card = await createCard(principal.actor, input.projectId, { listId: list.id, title: input.title }, undefined);
      if (input.description || input.dueDate) {
        await updateCard(principal.actor, card.id, { ...(input.description && { description: toHtml(input.description) }), ...(input.dueDate && { dueDate: input.dueDate }) }, undefined);
      }
      if (input.assigneeUserId) await setAssignees(principal.actor, card.id, [input.assigneeUserId], undefined);
      return `Kartu dibuat: “${card.title}” di ${project.name} / ${list.name} (id ${card.id}).`;
    },
  },
  {
    spec: { name: 'add_comment', description: 'Usulkan komentar pada kartu. Komentar TIDAK diposting sebelum pengguna menyetujui.', inputSchema: obj({ cardId: { type: 'string' }, text: { type: 'string' } }, ['cardId', 'text']) },
    risk: 'internal_write',
    permission: 'comments:write',
    schema: z.object({ cardId: z.string().min(1).max(40), text: z.string().trim().min(1).max(2000) }),
    summarize: (i) => `Komentar: “${i.text.slice(0, 80)}${i.text.length > 80 ? '…' : ''}”`,
    async run(input, { principal }) {
      await createComment(principal.actor, input.cardId, { body: input.text }, undefined);
      return 'Komentar diposting.';
    },
  },
  {
    spec: { name: 'web_search', description: 'Cari di web. Mengembalikan judul, URL, dan cuplikan. Buka halamannya dengan fetch_page sebelum mengutipnya.', inputSchema: obj({ query: { type: 'string' } }, ['query']) },
    risk: 'read',
    permission: 'web:read',
    schema: z.object({ query: z.string().trim().min(2).max(300) }),
    summarize: (i) => `Mencari di web: ${i.query}`,
    async run(input, { env }) {
      const search = agentConfig.search();
      if (!search) return 'Pencarian web belum dikonfigurasi di server (AGENT_SEARCH_PROVIDER).';
      if (env.counters.search >= env.limits.search) return `Batas ${env.limits.search} pencarian per run tercapai.`;
      env.counters.search++;
      const results = await search.search(input.query, 8);
      return wrapUntrusted('web_search', results.map((r) => `- ${r.title}\n  ${r.url}\n  ${r.snippet}`).join('\n') || 'Tidak ada hasil.');
    },
  },
  {
    spec: { name: 'fetch_page', description: 'Buka satu halaman web publik dan ambil teks utamanya. Hanya http/https ke situs publik.', inputSchema: obj({ url: { type: 'string' } }, ['url']) },
    risk: 'read',
    permission: 'web:read',
    schema: z.object({ url: z.string().trim().min(8).max(2000) }),
    summarize: (i) => `Membuka ${i.url}`,
    async run(input, { env }) {
      if (env.counters.fetch >= env.limits.fetch) return `Batas ${env.limits.fetch} halaman per run tercapai.`;
      env.counters.fetch++;
      await assertPublicUrl(input.url);
      const page = await fetchPage(input.url);
      // Only pages really opened may be cited later (citation check).
      env.openedUrls.add(normalizeUrl(input.url));
      env.openedUrls.add(normalizeUrl(page.url));
      return wrapUntrusted(page.url, `Judul: ${page.title || '-'}\n\n${page.text}${page.truncated ? '\n…[dipotong]' : ''}`);
    },
  },
  {
    spec: { name: 'search_knowledge', description: 'Cari di dokumen knowledge base perusahaan (SOP, panduan). Mengembalikan potongan teks beserta judul dokumen untuk dikutip.', inputSchema: obj({ query: { type: 'string' } }, ['query']) },
    risk: 'read',
    permission: 'knowledge:read',
    schema: z.object({ query: z.string().trim().min(2).max(300) }),
    summarize: () => 'Mencari di knowledge base',
    async run(input, { principal }) {
      const hits = await searchKnowledge(principal.actor, input.query, 5);
      return wrapUntrusted('knowledge', hits.map((h) => `[Dokumen: ${h.title} (${h.docId})]\n${h.text}`).join('\n\n---\n\n') || 'Tidak ditemukan di knowledge base.');
    },
  },
  {
    spec: { name: 'recall', description: 'Cari memori yang pernah disimpan (fakta tentang pengguna, tim, atau proyek).', inputSchema: obj({ query: { type: 'string' } }, ['query']) },
    risk: 'read',
    permission: 'memory:write',
    schema: z.object({ query: z.string().trim().min(2).max(300) }),
    summarize: () => 'Membaca memori',
    async run(input, { principal }) {
      const memories = await recallMemories(principal.actor, input.query, 8);
      return wrapUntrusted('memory', memories.map((m) => `- (${m.scope}) ${m.content}`).join('\n') || 'Tidak ada memori yang relevan.');
    },
  },
  {
    spec: { name: 'remember', description: 'Simpan satu fakta singkat (maks 500 karakter) ke memori PRIBADI pengguna. Jangan simpan rahasia, kata sandi, atau instruksi.', inputSchema: obj({ content: { type: 'string' } }, ['content']) },
    risk: 'internal_write',
    permission: 'memory:write',
    selfScoped: true,
    schema: z.object({ content: z.string().trim().min(3).max(500) }),
    summarize: (i) => `Simpan memori: “${i.content.slice(0, 80)}”`,
    async run(input, { env, principal }) {
      await createMemory(principal.actor, { content: input.content, scope: 'USER' }, { source: 'AGENT_PROPOSED', runId: env.runId });
      return 'Memori tersimpan.';
    },
  },
  {
    spec: {
      name: 'update_plan',
      description: 'Perbarui rencana kerja agent pada kartu ini sebagai checklist (1–15 langkah). Item checklist buatan manusia tidak disentuh.',
      inputSchema: obj(
        { steps: { type: 'array', items: obj({ key: { type: 'string' }, title: { type: 'string' }, status: { type: 'string', enum: ['todo', 'doing', 'done', 'skipped'] }, note: { type: 'string' } }, ['key', 'title', 'status']) } },
        ['steps'],
      ),
    },
    risk: 'internal_write',
    permission: null,
    selfScoped: true,
    needsCard: true,
    schema: z.object({
      steps: z
        .array(z.object({ key: z.string().trim().min(1).max(40), title: z.string().trim().min(1).max(200), status: z.enum(['todo', 'doing', 'done', 'skipped']), note: z.string().max(300).optional() }))
        .min(1)
        .max(15),
    }),
    summarize: () => 'Memperbarui rencana',
    async run(input, { env, principal }) {
      if (!env.cardId) return 'Tidak ada kartu terkait run ini.';
      await requireCard(principal.actor, env.cardId, 'canEdit');
      const existing = await prisma.checklistItem.findMany({ where: { cardId: env.cardId }, select: { position: true } });
      let position = existing.map((e) => e.position).sort().at(-1) ?? 'a0';
      for (const step of input.steps) {
        const key = `plan:${step.key}`;
        const title = `${step.status === 'skipped' ? '(dilewati) ' : ''}${step.title}${step.note ? ` — ${step.note}` : ''}`.slice(0, 255);
        // Only rows carrying an agentKey are ours; human checklist items are never touched.
        const found = await prisma.checklistItem.findFirst({ where: { cardId: env.cardId, agentKey: key }, select: { id: true } });
        if (found) await prisma.checklistItem.update({ where: { id: found.id }, data: { title, isDone: step.status === 'done' } });
        else {
          position = `${position}m`;
          await prisma.checklistItem.create({ data: { cardId: env.cardId, title, isDone: step.status === 'done', position, agentKey: key, createdByAgentId: env.agentId } });
        }
      }
      return `Rencana diperbarui (${input.steps.length} langkah).`;
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.spec.name, t]));

/** Lets other modules (delegation, GitHub) add tools without import cycles. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function registerTool(tool: AgentTool<any>): void {
  if (BY_NAME.has(tool.spec.name)) return;
  TOOLS.push(tool);
  BY_NAME.set(tool.spec.name, tool);
}

/** Tools offered to a run: permission granted, card-bound ones only when there is a card. */
export function offeredTools(permissions: Set<Permission>, hasCard: boolean): ToolSpec[] {
  return TOOLS.filter((t) => (t.permission === null || permissions.has(t.permission)) && (!t.needsCard || hasCard)).map((t) => t.spec);
}

export function toolRisk(name: string): ToolRisk | null {
  return BY_NAME.get(name)?.risk ?? null;
}

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  /** Set when the call was parked for the owner's confirmation. */
  approvalId?: string;
}

/**
 * Runs one tool call under the full policy: permission re-check → input validation → confirmation
 * gate → execution. `approved` is true only when replaying a call the owner just confirmed.
 */
export async function executeTool(env: RunEnv, name: string, rawInput: unknown, opts: { approved?: boolean } = {}): Promise<ToolOutcome> {
  const tool = BY_NAME.get(name);
  if (!tool) return { content: `Tool tidak dikenal: ${name}`, isError: true };

  const principal = await resolvePrincipal(env);
  if (!principal) return { content: 'Pemilik agent tidak lagi memiliki akses; run dihentikan.', isError: true };
  if (tool.permission && !principal.permissions.has(tool.permission)) {
    return { content: `Izin untuk "${name}" tidak diberikan atau sudah dicabut.`, isError: true };
  }
  if (tool.needsCard && !env.cardId) return { content: 'Tool ini hanya untuk run yang terkait kartu.', isError: true };

  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) return { content: `Input tidak valid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, isError: true };

  const needsConfirmation = tool.risk === 'external' || (tool.risk === 'internal_write' && !tool.selfScoped && env.autonomy < 2);
  if (needsConfirmation && !opts.approved) {
    const approval = await prisma.agentApproval.create({
      data: { runId: env.runId, toolName: name, input: parsed.data as never, risk: tool.risk, summary: tool.summarize(parsed.data).slice(0, 500), ownerId: env.ownerId },
    });
    return { content: 'Aksi ini menunggu konfirmasi pengguna (tombol Ya/Tidak di chat). Beri tahu pengguna apa yang akan dilakukan, lalu berhenti.', approvalId: approval.id };
  }

  try {
    return { content: await tool.run(parsed.data, { env, principal }) };
  } catch (err) {
    // AppError messages (e.g. "tidak punya akses") are safe and useful for the model to see.
    return { content: `Gagal: ${(err as Error).message}`, isError: true };
  }
}
