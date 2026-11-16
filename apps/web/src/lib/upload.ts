import { MAX_UPLOAD_BYTES, formatBytes, type AttachmentDTO } from '@nexus/shared';
import { api } from './api';
import { resolveApiUrl } from './apiBase';

export class UploadError extends Error {}

/**
 * Direct-to-storage upload (PRD §6): ask the API for a presigned URL, PUT the bytes
 * straight to object storage, then confirm so the API can verify and mark it READY.
 */
export async function uploadFile(
  projectId: string,
  file: File,
  cardId?: string,
): Promise<AttachmentDTO> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError(`${file.name} melebihi batas ${formatBytes(MAX_UPLOAD_BYTES)}.`);
  }

  const { attachment, upload } = await api.attachments.presign(projectId, {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    cardId,
  });

  const response = await fetch(resolveApiUrl(upload.url), {
    method: upload.method,
    headers: upload.headers,
    body: file,
  });
  if (!response.ok) throw new UploadError(`Gagal mengunggah ${file.name}.`);

  return api.attachments.complete(attachment.id);
}
