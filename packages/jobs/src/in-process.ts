import type { EmailJob, SchedulerJobName } from '@nexus/shared';
import type { JobContext } from './context';
import { processEmailJob } from './email.processor';
import { runScheduledJob, schedules, type ScheduleConfig } from './schedule';

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
const STARTUP_DELAY_MS = 30_000;

/** "HH:MM" plus the calendar date in the given IANA time zone. */
function clockIn(timeZone: string, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')), minute: Number(get('minute')) };
}

/**
 * Job runner for single-process deployments without Redis (local development).
 * Same job code as the BullMQ worker, but scheduled with timers and retried in memory.
 * Not durable: pending emails are lost if the process stops — use Redis in production.
 */
export function startInProcessJobs(ctx: Omit<JobContext, 'enqueueEmail'>, config: ScheduleConfig) {
  const timers: NodeJS.Timeout[] = [];
  const running = new Set<SchedulerJobName>();
  const lastDailyRun = new Map<SchedulerJobName, string>();

  const enqueueEmail = async (job: EmailJob): Promise<void> => {
    const attempt = (n: number) => {
      processEmailJob(fullCtx, job).catch((err: unknown) => {
        const delay = RETRY_DELAYS_MS[n];
        if (delay === undefined) return ctx.logger.error({ err, kind: job.kind }, 'email job failed permanently');
        ctx.logger.warn({ err, kind: job.kind, attempt: n + 1 }, 'email job failed, retrying');
        timers.push(setTimeout(() => attempt(n + 1), delay));
      });
    };
    setImmediate(() => attempt(0));
  };

  const fullCtx: JobContext = { ...ctx, enqueueEmail };

  const run = async (name: SchedulerJobName) => {
    if (running.has(name)) return; // never overlap with itself
    running.add(name);
    try {
      await runScheduledJob(fullCtx, name);
    } catch (err) {
      ctx.logger.error({ err, job: name }, 'scheduled job failed');
    } finally {
      running.delete(name);
    }
  };

  for (const schedule of schedules(config)) {
    if ('everyMinutes' in schedule) {
      timers.push(setTimeout(() => void run(schedule.name), STARTUP_DELAY_MS));
      timers.push(setInterval(() => void run(schedule.name), schedule.everyMinutes * 60_000));
    } else {
      // Check once a minute whether the wall clock in the configured zone hit the slot.
      timers.push(
        setInterval(() => {
          const now = clockIn(config.timeZone);
          const due = now.hour === schedule.dailyAt.hour && now.minute >= schedule.dailyAt.minute;
          if (due && lastDailyRun.get(schedule.name) !== now.day) {
            lastDailyRun.set(schedule.name, now.day);
            void run(schedule.name);
          }
        }, 60_000),
      );
    }
  }
  timers.forEach((t) => t.unref());

  return {
    enqueueEmail,
    stop() {
      timers.forEach((t) => clearTimeout(t));
    },
  };
}
