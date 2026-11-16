import { Redis } from 'ioredis';
import { config, env } from '../config/env';
import { logger } from './logger';

let client: Redis | null = null;

/**
 * Shared Redis connection, or null when REDIS_URL is not configured (single-instance
 * mode). `maxRetriesPerRequest: null` is required by BullMQ.
 */
export function getRedis(): Redis | null {
  if (!config.redisEnabled || config.isTest) return null;
  if (!client) {
    client = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: null });
    client.on('error', (err) => logger.error({ err }, 'redis error'));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
