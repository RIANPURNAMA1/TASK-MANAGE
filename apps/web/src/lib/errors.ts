import { toast } from 'sonner';
import { ApiError } from '@nexus/api-client';
import { UploadError } from './upload';

export function errorMessage(error: unknown, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  if (error instanceof ApiError) {
    if (error.code === 'RATE_LIMITED') return 'Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.';
    if (error.code === 'FORBIDDEN') return 'Anda tidak memiliki akses untuk aksi ini.';
    return error.message || fallback;
  }
  if (error instanceof UploadError) return error.message;
  if (error instanceof TypeError) return 'Tidak dapat terhubung ke server.';
  return fallback;
}

export function toastError(error: unknown, fallback?: string): void {
  toast.error(errorMessage(error, fallback));
}

/** Field-level messages from a `VALIDATION_ERROR` response (zod flatten format). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return {};
  const details = error.details as { fieldErrors?: Record<string, string[] | undefined> } | undefined;
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(details?.fieldErrors ?? {})) {
    if (messages?.[0]) result[field] = messages[0];
  }
  return result;
}
