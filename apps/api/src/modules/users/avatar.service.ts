import { randomBytes } from 'node:crypto';
import { prisma } from '@nexus/db';
import {
  AVATAR_FILE_PATTERN,
  AVATAR_MAX_BYTES,
  type AvatarUploadInput,
  type AvatarUploadResponse,
  type Me,
} from '@nexus/shared';
import { config } from '../../config/env';
import { badRequest, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { storage } from '../../lib/storage';
import type { Actor } from '../access/actor';
import { loadMe } from './users.service';

/**
 * Profile photos live in the same private storage as attachments, under
 * `avatars/<userId>/<random>.<ext>`. `User.avatarUrl` points at the public
 * `GET /avatars/:userId/:file` route, which only redirects to a short-lived signed URL
 * when that file is the user's *current* avatar (no listing, no stale uploads).
 */

const EXTENSION: Record<AvatarUploadInput['contentType'], string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const CONTENT_TYPE: Record<string, string> = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };

const AVATAR_PATH = `${config.apiPrefix}/avatars`;
const storageKey = (userId: string, file: string) => `avatars/${userId}/${file}`;
const publicUrl = (userId: string, file: string) => `${AVATAR_PATH}/${userId}/${file}`;

/** The stored file name if `avatarUrl` is one of ours (not e.g. a Google photo). */
function ownFile(userId: string, avatarUrl: string | null): string | null {
  const prefix = `${AVATAR_PATH}/${userId}/`;
  if (!avatarUrl?.startsWith(prefix)) return null;
  const file = avatarUrl.slice(prefix.length);
  return AVATAR_FILE_PATTERN.test(file) ? file : null;
}

export async function presignAvatarUpload(actor: Actor, input: AvatarUploadInput): Promise<AvatarUploadResponse> {
  const file = `${randomBytes(16).toString('hex')}.${EXTENSION[input.contentType]}`;
  return {
    file,
    upload: {
      url: await storage.presignUpload(storageKey(actor.userId, file), input.contentType),
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
    },
  };
}

export async function completeAvatarUpload(actor: Actor, file: string): Promise<Me> {
  const key = storageKey(actor.userId, file);
  const size = await storage.objectSize(key);
  if (size === null) throw badRequest('Foto belum terunggah. Silakan coba lagi.');
  if (size > AVATAR_MAX_BYTES) {
    await storage.remove(key);
    throw badRequest('Ukuran foto maksimal 2 MB');
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { avatarUrl: true } });
  await prisma.user.update({ where: { id: actor.userId }, data: { avatarUrl: publicUrl(actor.userId, file) } });
  await removeOldFile(actor.userId, user.avatarUrl, file);
  return loadMe(actor.userId);
}

export async function removeAvatar(actor: Actor): Promise<Me> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { avatarUrl: true } });
  await prisma.user.update({ where: { id: actor.userId }, data: { avatarUrl: null } });
  await removeOldFile(actor.userId, user.avatarUrl, null);
  return loadMe(actor.userId);
}

async function removeOldFile(userId: string, avatarUrl: string | null, keep: string | null) {
  const old = ownFile(userId, avatarUrl);
  if (!old || old === keep) return;
  // Best effort: a leftover object is harmless, it is never served again.
  await storage.remove(storageKey(userId, old)).catch((err: unknown) => logger.warn({ err, userId }, 'avatar cleanup failed'));
}

/** Signed URL for a user's current avatar, or a 404 for anything else. */
export async function avatarRedirect(userId: string, file: string): Promise<string> {
  if (!AVATAR_FILE_PATTERN.test(file) || !/^[\w-]{1,64}$/.test(userId)) throw notFound('Avatar');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
  if (!user || ownFile(userId, user.avatarUrl) !== file) throw notFound('Avatar');
  const ext = file.split('.').pop()!;
  return storage.presignDownload(storageKey(userId, file), {
    fileName: `avatar.${ext}`,
    contentType: CONTENT_TYPE[ext] ?? 'application/octet-stream',
    inline: true,
  });
}
