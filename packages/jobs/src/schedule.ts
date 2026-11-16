import type { SchedulerJobName } from '@nexus/shared';
import type { JobContext } from './context';
import { runCleanup } from './cleanup';
import { runDailyDigest } from './digest';
import { runDueReminders } from './reminders';

export interface ScheduleConfig {
  timeZone: string;
  dailyDigestHour: number;
}

/** Single source of truth for recurring jobs, used by both BullMQ and the in-process runner. */
export function schedules(config: ScheduleConfig) {
  return [
    { name: 'due-reminders', cron: '*/15 * * * *', everyMinutes: 15 },
    { name: 'daily-digest', cron: `0 ${config.dailyDigestHour} * * *`, dailyAt: { hour: config.dailyDigestHour, minute: 0 } },
    { name: 'cleanup', cron: '30 3 * * *', dailyAt: { hour: 3, minute: 30 } },
  ] as const satisfies readonly {
    name: SchedulerJobName;
    cron: string;
    everyMinutes?: number;
    dailyAt?: { hour: number; minute: number };
  }[];
}

export function runScheduledJob(ctx: JobContext, name: SchedulerJobName): Promise<void> {
  switch (name) {
    case 'due-reminders':
      return runDueReminders(ctx);
    case 'daily-digest':
      return runDailyDigest(ctx);
    case 'cleanup':
      return runCleanup(ctx);
  }
}
