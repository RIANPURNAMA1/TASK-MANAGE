import { prisma } from '@nexus/db';
import { z } from 'zod';
import type { Actor } from '../access/actor';
import { badRequest, notFound } from '../../lib/errors';
import { overlapScore, readableScopeWhere, requireScopeManager, tokens } from './scopes';

export const createKnowledgeSchema = z.object({
  title: z.string().trim().min(2).max(255),
  /** Plain text / Markdown. PDF and DOCX parsing needs the indexing worker (not deployed yet). */
  content: z.string().trim().min(20).max(500_000),
  scope: z.enum(['USER', 'PROJECT', 'DIVISION', 'ORG']).default('ORG'),
  scopeId: z.string().min(1).max(40).optional(),
});

const CHUNK_CHARS = 3200; // ≈ 800 tokens
const OVERLAP_CHARS = 400; // ≈ 100 tokens

/** Splits text into overlapping chunks, preferring paragraph / sentence boundaries. */
export function chunkText(text: string, size = CHUNK_CHARS, overlap = OVERLAP_CHARS): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim();
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('\n'));
      if (cut > size * 0.5) end = start + cut + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}

export async function createKnowledgeDoc(actor: Actor, input: z.infer<typeof createKnowledgeSchema>) {
  const scopeId = input.scopeId ?? (input.scope === 'ORG' ? actor.orgId : input.scope === 'USER' ? actor.userId : '');
  if (!scopeId) throw badRequest('scopeId wajib untuk scope PROJECT atau DIVISION.');
  await requireScopeManager(actor, input.scope, scopeId);

  const chunks = chunkText(input.content);
  const doc = await prisma.knowledgeDoc.create({
    data: {
      orgId: actor.orgId,
      scope: input.scope,
      scopeId,
      title: input.title,
      mimeType: 'text/plain',
      status: 'READY',
      chunkCount: chunks.length,
      uploadedById: actor.userId,
      chunks: { create: chunks.map((text, seq) => ({ seq, text, tokenCount: Math.ceil(text.length / 4) })) },
    },
  });
  return { id: doc.id, title: doc.title, scope: doc.scope, scopeId: doc.scopeId, status: doc.status, chunkCount: doc.chunkCount, createdAt: doc.createdAt.toISOString() };
}

export async function listKnowledgeDocs(actor: Actor) {
  const docs = await prisma.knowledgeDoc.findMany({ where: await readableScopeWhere(actor), orderBy: { createdAt: 'desc' }, take: 200 });
  return docs.map((d) => ({ id: d.id, title: d.title, scope: d.scope, scopeId: d.scopeId, status: d.status, chunkCount: d.chunkCount, createdAt: d.createdAt.toISOString() }));
}

/** Deleting a document removes all of its chunks (cascade). */
export async function deleteKnowledgeDoc(actor: Actor, id: string): Promise<void> {
  const doc = await prisma.knowledgeDoc.findFirst({ where: { id, orgId: actor.orgId } });
  if (!doc) throw notFound('Dokumen');
  await requireScopeManager(actor, doc.scope, doc.scopeId);
  await prisma.knowledgeDoc.delete({ where: { id } });
}

export interface KnowledgeHit {
  docId: string;
  title: string;
  text: string;
  score: number;
}

/** Best matching passages from documents in scopes the actor may read (server-side filter). */
export async function searchKnowledge(actor: Actor, query: string, topK = 5): Promise<KnowledgeHit[]> {
  const q = tokens(query);
  if (q.length === 0) return [];
  const chunks = await prisma.knowledgeChunk.findMany({
    where: { doc: { ...(await readableScopeWhere(actor)), status: 'READY' } },
    include: { doc: { select: { id: true, title: true } } },
    take: 3000,
  });
  return chunks
    .map((c) => ({ docId: c.doc.id, title: c.doc.title, text: c.text, score: overlapScore(q, `${c.doc.title} ${c.text}`) }))
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(topK, 8));
}
