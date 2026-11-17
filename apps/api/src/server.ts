import { createServer } from 'node:http';
import { prisma } from '@nexus/db';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { closeQueues, startJobs } from './lib/queue';
import { closeRedis } from './lib/redis';
import { failInterruptedRuns } from './modules/agents/runner';
import { startScheduleTicker } from './modules/agents/schedules.service';
import { createRealtimeServer } from './realtime/socket';

const httpServer = createServer(createApp());
const realtime = createRealtimeServer(httpServer);
startJobs();
// Workbase Agent: runs cut off by a restart can never finish; due schedules are polled every minute.
void failInterruptedRuns().catch((err) => logger.error({ err }, 'failInterruptedRuns'));
startScheduleTicker();

httpServer.listen(env.API_PORT, () => {
  logger.info(`API listening on http://localhost:${env.API_PORT}`);
});

/** Stop accepting work, let in-flight requests finish, then release connections. */
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');

  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();

  await realtime.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await Promise.allSettled([closeQueues(), prisma.$disconnect()]);
  await closeRedis();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
