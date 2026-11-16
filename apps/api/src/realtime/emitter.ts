import { rooms, type ServerToClientEvents } from '@nexus/shared';
import type { Server } from 'socket.io';

type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];

let io: Server<Record<string, never>, ServerToClientEvents> | null = null;

/** Called once at boot. Until then (and in unit tests) emits are no-ops. */
export function bindRealtimeServer(server: Server<Record<string, never>, ServerToClientEvents>) {
  io = server;
}

/**
 * Typed broadcast helpers. Services call these from `afterCommit` so clients never
 * observe a change that was rolled back. `exceptSocketId` skips the originating tab,
 * which already applied the change optimistically.
 */
export const realtime = {
  toProject<E extends EventName>(projectId: string, event: E, payload: Payload<E>, exceptSocketId?: string) {
    if (!io) return;
    const target = io.to(rooms.project(projectId));
    const scoped = exceptSocketId ? target.except(exceptSocketId) : target;
    (scoped.emit as (e: string, p: unknown) => void)(event, payload);
  },

  toUser<E extends EventName>(userId: string, event: E, payload: Payload<E>) {
    if (!io) return;
    (io.to(rooms.user(userId)).emit as (e: string, p: unknown) => void)(event, payload);
  },

  /** One emit to several users; a socket in more than one of the rooms receives it once. */
  toUsers<E extends EventName>(userIds: readonly string[], event: E, payload: Payload<E>) {
    if (!io || userIds.length === 0) return;
    (io.to(userIds.map(rooms.user)).emit as (e: string, p: unknown) => void)(event, payload);
  },

  /** Ids of users with at least one connected socket, across all API instances (FR-33). */
  async onlineUserIds(orgId: string): Promise<string[]> {
    if (!io) return [];
    const sockets = await io.in(rooms.org(orgId)).fetchSockets();
    return [...new Set(sockets.map((s) => (s.data as { actor?: { userId: string } }).actor?.userId))].filter(
      (id): id is string => typeof id === 'string',
    );
  },

  /** Notifies and disconnects every socket bound to a revoked session. */
  revokeSession(sessionId: string) {
    if (!io) return;
    const room = rooms.session(sessionId);
    io.to(room).emit('session:revoked');
    io.in(room).disconnectSockets(true);
  },
};
