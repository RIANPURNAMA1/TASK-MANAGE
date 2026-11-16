/**
 * Background job contract between apps/api (producer) and apps/worker (consumer).
 * Backend-only, but kept here so both sides share one definition.
 */

export const QUEUES = {
  email: 'email',
  scheduler: 'scheduler',
} as const;

export type EmailJob =
  | { kind: 'verify-email'; userId: string; token: string }
  | { kind: 'reset-password'; userId: string; token: string }
  | { kind: 'invitation'; invitationId: string; link: string }
  | { kind: 'notification'; notificationId: string };

export type SchedulerJobName = 'due-reminders' | 'daily-digest' | 'cleanup';
