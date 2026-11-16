import { createMailer, startInProcessJobs } from '@nexus/jobs';
import { QUEUES, type EmailJob } from '@nexus/shared';
import { Queue } from 'bullmq';
import { config, env } from '../config/env';
import { realtime } from '../realtime/emitter';
import { logger } from './logger';
import { getRedis } from './redis';

interface JobGateway {
  enqueueEmail(job: EmailJob): Promise<void>;
  close(): Promise<void>;
}

/** With Redis: hand jobs to the BullMQ worker process (durable, retried, multi-instance safe). */
function bullmqGateway(): JobGateway {
  const queue = new Queue<EmailJob>(QUEUES.email, {
    connection: getRedis()!,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 10_000 },
      // Jobs may carry one-time tokens; don't keep them around in Redis.
      removeOnComplete: true,
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  });
  return {
    enqueueEmail: async (job) => {
      await queue.add(job.kind, job);
    },
    close: () => queue.close(),
  };
}

/** Without Redis: run the same jobs inside this process (local development, single instance). */
function inProcessGateway(): JobGateway {
  const mailer = createMailer(
    { host: env.SMTP_HOST, port: env.SMTP_PORT, user: env.SMTP_USER, password: env.SMTP_PASSWORD, from: env.MAIL_FROM },
    logger,
  );
  const runner = startInProcessJobs(
    {
      webUrl: env.WEB_URL,
      logger,
      sendMail: (mail) => mailer.send(mail),
      emitToUser: (userId, event, payload) => realtime.toUser(userId, event, payload),
    },
    { timeZone: env.TZ_DEFAULT, dailyDigestHour: env.DAILY_DIGEST_HOUR },
  );
  logger.info('Redis tidak dikonfigurasi: job (email, reminder, digest) berjalan di dalam proses API');
  return {
    enqueueEmail: runner.enqueueEmail,
    close: async () => {
      runner.stop();
      mailer.close();
    },
  };
}

let gateway: JobGateway | null = null;

/** Called once at boot by the server; tests never start it, so enqueueing is a no-op there. */
export function startJobs(): void {
  gateway ??= config.redisEnabled ? bullmqGateway() : inProcessGateway();
}

/**
 * Hands an email off for delivery. Never throws: a failed enqueue must not roll back
 * or fail the user-facing request that triggered it.
 */
export async function enqueueEmail(job: EmailJob): Promise<void> {
  if (!gateway) return;
  try {
    await gateway.enqueueEmail(job);
  } catch (err) {
    logger.error({ err, kind: job.kind }, 'failed to enqueue email');
  }
}

export async function closeQueues(): Promise<void> {
  await gateway?.close();
  gateway = null;
}
