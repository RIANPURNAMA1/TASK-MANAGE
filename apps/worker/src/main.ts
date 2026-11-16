import { prisma } from '@nexus/db';
import { createMailer, processEmailJob, runScheduledJob, schedules, type JobContext } from '@nexus/jobs';
import { QUEUES, rooms, type EmailJob, type SchedulerJobName } from '@nexus/shared';
import { Emitter } from '@socket.io/redis-emitter';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import pino from 'pino';
import { env } from './config';

const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname' } },
  }),
});

/**
 * Dedicated job process for deployments with Redis (PRD §6). Without REDIS_URL the API
 * runs the same jobs in-process, so this worker has nothing to do.
 */
if (!env.REDIS_URL) {
  logger.info('REDIS_URL kosong — job berjalan di dalam proses API. Worker tidak diperlukan.');
  process.exit(0);
}

// BullMQ requires `maxRetriesPerRequest: null`.
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
redis.on('error', (err) => logger.error({ err }, 'redis error'));

const emailQueue = new Queue<EmailJob>(QUEUES.email, {
  connection: redis,
  defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true },
});
const schedulerQueue = new Queue(QUEUES.scheduler, { connection: redis });

// Socket.IO events are published through Redis and delivered by the API instances.
const emitter = new Emitter(redis.duplicate());
const mailer = createMailer(
  { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, password: env.SMTP_PASSWORD, from: env.MAIL_FROM },
  logger,
);

const ctx: JobContext = {
  webUrl: env.WEB_URL,
  logger,
  sendMail: (mail) => mailer.send(mail),
  emitToUser: (userId, event, payload) => {
    (emitter.to(rooms.user(userId)).emit as (e: string, p: unknown) => void)(event, payload);
  },
  enqueueEmail: async (job) => {
    await emailQueue.add(job.kind, job);
  },
};

const scheduleConfig = { timeZone: env.TZ_DEFAULT, dailyDigestHour: env.DAILY_DIGEST_HOUR };
for (const { name, cron } of schedules(scheduleConfig)) {
  // Idempotent: re-registering a scheduler with the same id just updates it.
  await schedulerQueue.upsertJobScheduler(name, { pattern: cron, tz: env.TZ_DEFAULT }, { name });
}

const workers = [
  new Worker<EmailJob>(QUEUES.email, (job) => processEmailJob(ctx, job.data), { connection: redis, concurrency: 5 }),
  // Concurrency 1: scheduled jobs scan tables and must not overlap with themselves.
  new Worker(QUEUES.scheduler, (job) => runScheduledJob(ctx, job.name as SchedulerJobName), {
    connection: redis,
    concurrency: 1,
  }),
];
for (const worker of workers) {
  worker.on('failed', (job, err) => logger.error({ err, job: job?.name, attempts: job?.attemptsMade }, 'job failed'));
}
logger.info('worker started');

async function shutdown(signal: string) {
  logger.info({ signal }, 'worker shutting down');
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([emailQueue.close(), schedulerQueue.close(), prisma.$disconnect()]);
  mailer.close();
  await redis.quit();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
