import { randomUUID } from 'node:crypto';
import { prisma } from '@nexus/db';
import {
  isAllowedMime,
  isPreviewableMime,
  MAX_UPLOAD_BYTES,
  sanitizeFileName,
  type AttachmentDTO,
  type PresignUploadInput,
  type PresignUploadResponse,
  type SignedUrlResponse,
} from '@nexus/shared';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { SIGNED_URL_TTL_SECONDS, storage } from '../../lib/storage';
import { transactional } from '../../lib/transaction';
import type { Actor } from '../access/actor';
import { requireAttachment, requireProject } from '../access/access.service';
import { recordActivity } from '../activity/activity.service';
import { publishCard } from '../board/cards.service';
import { attachmentInclude, toAttachmentDTO } from './attachment.mapper';

type Origin = string | undefined;

/**
 * Step 1 of an upload: records a PENDING attachment and returns a 5-minute presigned PUT
 * URL. The browser uploads straight to object storage; the API never streams file bytes.
 */
export async function presignUpload(actor: Actor, projectId: string, input: PresignUploadInput): Promise<PresignUploadResponse> {
  await requireProject(actor, projectId, 'canEdit');
  if (!isAllowedMime(input.mimeType)) throw badRequest('Tipe file tidak diizinkan');
  if (input.cardId) {
    const card = await prisma.card.findFirst({ where: { id: input.cardId, projectId } });
    if (!card) throw notFound('Kartu');
  }

  const fileName = sanitizeFileName(input.fileName);
  const storageKey = `projects/${projectId}/${randomUUID()}/${fileName}`;
  const attachment = await prisma.attachment.create({
    data: {
      projectId,
      cardId: input.cardId ?? null,
      uploaderId: actor.userId,
      fileName,
      mimeType: input.mimeType,
      size: input.size,
      storageKey,
    },
    include: attachmentInclude,
  });

  return {
    attachment: toAttachmentDTO(attachment),
    upload: {
      url: await storage.presignUpload(storageKey, input.mimeType),
      method: 'PUT',
      headers: { 'Content-Type': input.mimeType },
    },
  };
}

/** Step 2: verifies the object really landed in storage with an acceptable size, then publishes it. */
export async function completeUpload(actor: Actor, attachmentId: string, origin: Origin): Promise<AttachmentDTO> {
  const { entity } = await requireAttachment(actor, attachmentId, 'canEdit');
  if (entity.uploaderId !== actor.userId) throw forbidden();
  if (entity.status === 'READY') throw conflict('File sudah diunggah');

  const size = await storage.objectSize(entity.storageKey);
  if (size === null) throw badRequest('File belum diunggah ke penyimpanan');
  if (size > MAX_UPLOAD_BYTES) {
    await storage.remove(entity.storageKey);
    await prisma.attachment.delete({ where: { id: attachmentId } });
    throw badRequest('Ukuran file maksimal 100 MB');
  }

  return transactional(async (tx, afterCommit) => {
    const row = await tx.attachment.update({
      where: { id: attachmentId },
      data: { status: 'READY', size },
      include: attachmentInclude,
    });
    await recordActivity(tx, {
      projectId: row.projectId, cardId: row.cardId, actorId: actor.userId, entityType: 'attachment',
      entityId: row.id, action: 'attachment.uploaded', diff: { fileName: row.fileName },
    });
    if (row.cardId) await publishCard(tx, afterCommit, row.cardId, origin);
    return toAttachmentDTO(row);
  });
}

/**
 * Short-lived signed download URL (bucket is private). Only images and PDFs are served
 * inline (FR-28); everything else is forced to download so it can't render in our origin.
 */
export async function signedUrl(actor: Actor, attachmentId: string, disposition: 'inline' | 'attachment'): Promise<SignedUrlResponse> {
  const { entity } = await requireAttachment(actor, attachmentId, 'canView');
  if (entity.status !== 'READY') throw notFound('File');
  const url = await storage.presignDownload(entity.storageKey, {
    fileName: entity.fileName,
    contentType: entity.mimeType,
    inline: disposition === 'inline' && isPreviewableMime(entity.mimeType),
  });
  return { url, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString() };
}

/** Soft delete; the object is purged by the retention job after 30 days (NFR-07). */
export async function deleteAttachment(actor: Actor, attachmentId: string, origin: Origin): Promise<void> {
  const { entity, access } = await requireAttachment(actor, attachmentId, 'canEdit');
  if (entity.uploaderId !== actor.userId && !access.canManage) throw forbidden();

  await transactional(async (tx, afterCommit) => {
    await tx.attachment.update({ where: { id: attachmentId }, data: { deletedAt: new Date() } });
    await recordActivity(tx, {
      projectId: entity.projectId, cardId: entity.cardId, actorId: actor.userId, entityType: 'attachment',
      entityId: attachmentId, action: 'attachment.deleted', diff: { fileName: entity.fileName },
    });
    if (entity.cardId) await publishCard(tx, afterCommit, entity.cardId, origin);
  });
}

export async function listProjectAttachments(actor: Actor, projectId: string): Promise<AttachmentDTO[]> {
  await requireProject(actor, projectId, 'canView');
  const rows = await prisma.attachment.findMany({
    where: { projectId, status: 'READY', deletedAt: null },
    include: attachmentInclude,
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  return rows.map(toAttachmentDTO);
}
