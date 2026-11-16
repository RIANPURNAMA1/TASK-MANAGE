import { Prisma } from '@nexus/db';
import type { ApiErrorBody } from '@nexus/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (_req, res) => {
  const body: ApiErrorBody = { error: { code: 'NOT_FOUND', message: 'Endpoint tidak ditemukan' } };
  res.status(404).json(body);
};

/** Maps known error types to the `{ error }` envelope; never leaks internals for the rest. */
export const errorHandler: ErrorRequestHandler = (err: unknown, req, res, _next) => {
  const send = (status: number, error: ApiErrorBody['error']) => res.status(status).json({ error });

  if (err instanceof AppError) {
    return send(err.status, { code: err.code, message: err.message, details: err.details });
  }

  if (err instanceof ZodError) {
    return send(400, {
      code: 'VALIDATION_ERROR',
      message: err.issues[0]?.message ?? 'Data tidak valid',
      details: err.flatten().fieldErrors,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return send(409, { code: 'CONFLICT', message: 'Data sudah ada' });
    if (err.code === 'P2025') return send(404, { code: 'NOT_FOUND', message: 'Data tidak ditemukan' });
  }

  // Malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    return send(400, { code: 'VALIDATION_ERROR', message: 'Body JSON tidak valid' });
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'unhandled error');
  return send(500, { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server' });
};
