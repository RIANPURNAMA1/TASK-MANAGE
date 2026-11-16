import type { CardSummary, LabelDTO, ListDTO, MessageDTO, NotificationDTO } from './types';

/**
 * Socket.IO contract. Treated like the REST API: additive changes only (PRD §4).
 *
 * Rooms: `project:<id>` (joined explicitly, membership re-checked by the server)
 * and `user:<id>` (joined automatically on connect).
 */

export interface ServerToClientEvents {
  'list:upserted': (payload: { projectId: string; list: ListDTO }) => void;
  'list:removed': (payload: { projectId: string; listId: string }) => void;
  'card:upserted': (payload: { projectId: string; card: CardSummary }) => void;
  'card:removed': (payload: { projectId: string; cardId: string }) => void;
  /** Something inside the card detail changed (comment, checklist, attachment…). */
  'card:detail-changed': (payload: { projectId: string; cardId: string }) => void;
  'labels:changed': (payload: { projectId: string; labels: LabelDTO[] }) => void;
  'project:changed': (payload: { projectId: string }) => void;
  'notification:new': (payload: { notification: NotificationDTO }) => void;
  /** The session was revoked from another device or by an admin. */
  'session:revoked': () => void;

  // Chat — delivered to every participant's user room, so unread badges update anywhere.
  'chat:message': (payload: { channelId: string; message: MessageDTO }) => void;
  /** Edited, deleted, or reactions changed. */
  'chat:message-updated': (payload: { channelId: string; message: MessageDTO }) => void;
  'chat:read': (payload: { channelId: string; userId: string; lastReadAt: string }) => void;
  /** Delivered to the channel room only (joined while the channel is open). */
  'chat:typing': (payload: { channelId: string; user: { id: string; name: string } }) => void;
  /** A user's first socket connected / last socket disconnected (org-wide). */
  'presence:changed': (payload: { userId: string; online: boolean }) => void;

  /** Posted, edited, pinned, deleted or commented on — sent to everyone who can see it. */
  'announcement:changed': (payload: { announcementId: string; deleted?: boolean }) => void;
}

export interface ClientToServerEvents {
  'project:join': (projectId: string, ack: (result: { ok: boolean }) => void) => void;
  'project:leave': (projectId: string) => void;
  'channel:join': (channelId: string, ack: (result: { ok: boolean }) => void) => void;
  'channel:leave': (channelId: string) => void;
  /** Throttle on the client (about once per 3 s while typing). */
  'chat:typing': (channelId: string) => void;
}

/** HTTP header carrying the caller's socket id so the server can skip echoing to it. */
export const SOCKET_ID_HEADER = 'x-socket-id';

export const rooms = {
  project: (id: string) => `project:${id}`,
  user: (id: string) => `user:${id}`,
  session: (id: string) => `session:${id}`,
  channel: (id: string) => `channel:${id}`,
  org: (id: string) => `org:${id}`,
} as const;
