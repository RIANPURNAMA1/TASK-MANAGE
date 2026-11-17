import { prisma } from '@nexus/db';
import { assertPublicUrl } from '@nexus/agent';
import type { LocalActionName } from '@nexus/shared';
import { z } from 'zod';
import { badRequest, notFound } from '../../lib/errors';
import { realtime } from '../../realtime/emitter';
import type { Actor } from '../access/actor';
import { postAgentMessage } from './runner';
import { registerTool, type AgentTool, type RunEnv } from './tools';

/**
 * Local actions on the owner's PC. The server NEVER touches the PC: after the owner approved the
 * action, it is pushed to the owner's own sockets and only the desktop app acts on it, inside a
 * fixed workspace folder (see `local.rs`). Both tools are risk `external`, so they cannot run
 * without a human pressing "Ya", and only Personal Agents get them (a Team Agent has no PC).
 */
export const MAX_LOCAL_FILE_BYTES = 200_000;

/** A plain file name: no folders, no dots-only names, only .md/.txt. The desktop re-checks it. */
export function safeFilename(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _().-]{0,78}$/u.test(name) || /\.\./.test(name)) return null;
  const withExt = /\.(md|txt)$/i.test(name) ? name : `${name}.md`;
  return withExt.length <= 80 ? withExt : null;
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });

/** Sends the approved action to the owner's desktop app. */
function dispatch(env: RunEnv, approvalId: string, tool: LocalActionName, input: Record<string, unknown>) {
  realtime.toUser(env.ownerId, 'agent:local-action', { approvalId, tool, input });
}

const writeFile: AgentTool = {
  spec: {
    name: 'local_write_file',
    description: 'Usulkan menyimpan satu file teks (.md/.txt) ke folder kerja agent di komputer pengguna (aplikasi desktop). Tidak menimpa file yang ada. Menunggu persetujuan pengguna.',
    inputSchema: obj({ filename: { type: 'string', description: 'Nama file saja, tanpa folder' }, content: { type: 'string' } }, ['filename', 'content']),
  },
  risk: 'external',
  permission: 'local:act',
  schema: z.object({ filename: z.string().trim().min(1).max(120), content: z.string().min(1).max(MAX_LOCAL_FILE_BYTES) }),
  summarize: (i) => `Simpan file “${i.filename}” di komputer Anda (${Math.ceil(i.content.length / 1000)} KB)`,
  async run(input, { env }) {
    if (env.agentId) return 'Ditolak: hanya Asisten Pribadi yang bisa bertindak di komputer pemilik.';
    const filename = safeFilename(input.filename);
    if (!filename) return 'Nama file tidak valid (hanya huruf, angka, spasi, _-.() dan tanpa folder).';
    // The approval id is attached by the caller via `env`-less lookup below.
    const approval = await prisma.agentApproval.findFirst({ where: { runId: env.runId, toolName: 'local_write_file', status: 'APPROVED' }, orderBy: { decidedAt: 'desc' } });
    if (!approval) return 'Persetujuan tidak ditemukan.';
    dispatch(env, approval.id, 'local_write_file', { filename, content: input.content });
    return `Dikirim ke aplikasi desktop Anda untuk disimpan sebagai “${filename}”. Hasilnya akan muncul di chat; jika aplikasi desktop tidak terbuka, file tidak dibuat.`;
  },
};

const openUrl: AgentTool = {
  spec: {
    name: 'local_open_url',
    description: 'Usulkan membuka satu URL web publik di browser pengguna (aplikasi desktop), misalnya untuk riset. Menunggu persetujuan pengguna.',
    inputSchema: obj({ url: { type: 'string' } }, ['url']),
  },
  risk: 'external',
  permission: 'local:act',
  schema: z.object({ url: z.string().trim().min(8).max(2000) }),
  summarize: (i) => `Buka ${i.url} di browser Anda`,
  async run(input, { env }) {
    if (env.agentId) return 'Ditolak: hanya Asisten Pribadi yang bisa bertindak di komputer pemilik.';
    await assertPublicUrl(input.url); // http/https to public hosts only: never file:, localhost or the LAN
    const approval = await prisma.agentApproval.findFirst({ where: { runId: env.runId, toolName: 'local_open_url', status: 'APPROVED' }, orderBy: { decidedAt: 'desc' } });
    if (!approval) return 'Persetujuan tidak ditemukan.';
    dispatch(env, approval.id, 'local_open_url', { url: input.url });
    return `Dikirim ke aplikasi desktop Anda untuk dibuka: ${input.url}`;
  },
};

registerTool(writeFile);
registerTool(openUrl);

/**
 * The desktop app reports what it did. Accepted once, only from the approval's owner, only for an
 * approved local action; the outcome is shown in the chat and logged on the run.
 */
export async function reportLocalResult(actor: Actor, approvalId: string, result: { ok: boolean; message: string }): Promise<void> {
  const approval = await prisma.agentApproval.findFirst({ where: { id: approvalId, ownerId: actor.userId }, include: { run: true } });
  if (!approval || !approval.toolName.startsWith('local_')) throw notFound('Aksi');
  if (approval.status !== 'APPROVED') throw badRequest('Aksi ini belum disetujui.');
  const done = await prisma.agentStep.findFirst({ where: { runId: approval.runId, toolName: 'local_result', input: { path: '$.approvalId', equals: approvalId } }, select: { id: true } });
  if (done) throw badRequest('Hasil aksi ini sudah dilaporkan.');

  const message = result.message.slice(0, 500);
  await prisma.agentStep.create({
    data: { runId: approval.runId, seq: 2_000_000 + Math.floor(Math.random() * 1_000_000), type: 'TOOL', toolName: 'local_result', input: { approvalId }, output: message, isError: !result.ok },
  });
  if (approval.run.conversationId) {
    await postAgentMessage(approval.run.conversationId, actor.userId, { role: 'SYSTEM', content: `${result.ok ? '💻 ✅' : '💻 ⚠️'} ${message}`, runId: approval.runId });
  }
}
