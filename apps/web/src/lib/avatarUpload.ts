import type { AvatarUploadInput, Me } from '@nexus/shared';
import { api } from './api';
import { resolveApiUrl } from './apiBase';
import { UploadError } from './upload';

/** Largest original we accept before resizing in the browser. */
export const AVATAR_SOURCE_MAX_BYTES = 10 * 1024 * 1024;
const OUTPUT_PX = 512;

/**
 * Center-crops to a square, scales to 512×512 and re-encodes (WebP, JPEG fallback).
 * Keeps uploads small and strips EXIF metadata such as GPS location.
 */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new UploadError('File harus berupa gambar (JPG, PNG, atau WebP).');
  if (file.size > AVATAR_SOURCE_MAX_BYTES) throw new UploadError('Ukuran foto maksimal 10 MB.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new UploadError('Gambar tidak dapat dibaca. Coba file lain.');
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const size = Math.min(OUTPUT_PX, side);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();

  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.88));
  const webp = await encode('image/webp');
  const blob = webp?.type === 'image/webp' ? webp : await encode('image/jpeg');
  if (!blob) throw new UploadError('Gagal memproses gambar.');
  return blob;
}

/** Presign → PUT straight to storage → confirm. Returns the updated profile. */
export async function uploadAvatar(file: File): Promise<Me> {
  const blob = await prepareAvatar(file);
  const contentType = blob.type as AvatarUploadInput['contentType'];
  const { file: name, upload } = await api.me.presignAvatar({ contentType, size: blob.size });
  const response = await fetch(resolveApiUrl(upload.url), { method: upload.method, headers: upload.headers, body: blob });
  if (!response.ok) throw new UploadError('Gagal mengunggah foto. Silakan coba lagi.');
  return api.me.completeAvatar(name);
}
