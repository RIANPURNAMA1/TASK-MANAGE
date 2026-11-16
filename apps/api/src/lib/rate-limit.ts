import type { RequestHandler } from 'express';
import {
  RateLimiterMemory,
  RateLimiterRedis,
  RateLimiterRes,
  type RateLimiterAbstract,
} from 'rate-limiter-flexible';
import { AppError } from './errors';
import { getRedis } from './redis';

/** Redis-backed so limits hold across API instances (NFR-09); in-memory without Redis. */
export function createLimiter(keyPrefix: string, points: number, durationSeconds: number) {
  const options = { keyPrefix: `rl:${keyPrefix}`, points, duration: durationSeconds };
  const redis = getRedis();
  return redis ? new RateLimiterRedis({ ...options, storeClient: redis }) : new RateLimiterMemory(options);
}

export function tooManyRequests(retryAfterSeconds: number): AppError {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new AppError(429, 'RATE_LIMITED', `Terlalu banyak percobaan. Coba lagi dalam ${minutes} menit.`);
}

/** Generic per-IP request limiter for a route group. */
export function rateLimit(limiter: RateLimiterAbstract): RequestHandler {
  return async (req, _res, next) => {
    try {
      await limiter.consume(req.ip ?? 'unknown');
      next();
    } catch (err) {
      if (err instanceof RateLimiterRes) throw tooManyRequests(err.msBeforeNext / 1000);
      throw err;
    }
  };
}
