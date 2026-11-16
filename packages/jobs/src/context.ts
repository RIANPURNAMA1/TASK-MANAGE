import type { EmailJob, ServerToClientEvents } from '@nexus/shared';

export interface JobLogger {
  debug(obj: object | string, msg?: string): void;
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Everything a job needs from its host process. The API (standalone mode) and the
 * BullMQ worker (Redis mode) each provide their own implementation, so job logic is
 * written once and never knows how it is being scheduled or delivered.
 */
export interface JobContext {
  webUrl: string;
  logger: JobLogger;
  sendMail(mail: OutgoingMail): Promise<void>;
  emitToUser<E extends keyof ServerToClientEvents>(
    userId: string,
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void;
  enqueueEmail(job: EmailJob): Promise<void>;
}

export const cardUrl = (webUrl: string, projectId: string | null, cardId: string | null) =>
  projectId && cardId ? `${webUrl}/projects/${projectId}?card=${cardId}` : webUrl;

/** Where a notification leads in the web app. */
export function notificationUrl(
  webUrl: string,
  n: { projectId: string | null; cardId: string | null; data: { channelId?: string; announcementId?: string } },
): string {
  if (n.data.announcementId) return `${webUrl}/announcements/${n.data.announcementId}`;
  return n.data.channelId ? `${webUrl}/chat/${n.data.channelId}` : cardUrl(webUrl, n.projectId, n.cardId);
}
