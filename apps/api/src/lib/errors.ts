import type { ErrorCode } from '@nexus/shared';

/** An error that is safe to show to the client. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const unauthenticated = (message = 'Sesi tidak valid, silakan login kembali') =>
  new AppError(401, 'UNAUTHENTICATED', message);

export const forbidden = (message = 'Anda tidak punya akses untuk aksi ini') =>
  new AppError(403, 'FORBIDDEN', message);

/** Also used for resources the caller may not see, so their existence is not leaked. */
export const notFound = (what = 'Data') => new AppError(404, 'NOT_FOUND', `${what} tidak ditemukan`);

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', message, details);
