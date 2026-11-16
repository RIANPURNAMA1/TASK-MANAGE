import { prisma } from '@nexus/db';
import { rooms, type ClientToServerEvents, type ServerToClientEvents } from '@nexus/shared';
import type { Server, Socket } from 'socket.io';
import { logger } from '../lib/logger';
import type { Actor } from '../modules/access/actor';
import { getChannelAccess } from '../modules/chat/chat.access';

export interface SocketData {
  actor: Actor;
  /** Lazily loaded for typing indicators. */
  displayName?: string;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type ChatSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const TYPING_MIN_INTERVAL_MS = 1_000;

/**
 * Presence (FR-33): announce a user as online when their first socket connects and
 * offline when their last one disconnects. `fetchSockets` spans all instances with Redis.
 */
export async function announcePresence(io: IO, socket: ChatSocket, online: boolean): Promise<void> {
  const { actor } = socket.data;
  const remaining = await io.in(rooms.user(actor.userId)).fetchSockets();
  const isTransition = online ? remaining.length === 1 : remaining.length === 0;
  if (isTransition) io.to(rooms.org(actor.orgId)).emit('presence:changed', { userId: actor.userId, online });
}

export function registerChatHandlers(socket: ChatSocket): void {
  const { actor } = socket.data;
  let lastTypingAt = 0;

  socket.on('channel:join', async (channelId, ack) => {
    const reply = typeof ack === 'function' ? ack : () => undefined;
    try {
      // Room ids from the client are never trusted: access is checked like the REST API.
      const access = typeof channelId === 'string' ? await getChannelAccess(actor, channelId) : null;
      if (!access) return reply({ ok: false });
      await socket.join(rooms.channel(channelId));
      reply({ ok: true });
    } catch (err) {
      logger.error({ err, channelId }, 'channel:join failed');
      reply({ ok: false });
    }
  });

  socket.on('channel:leave', (channelId) => {
    if (typeof channelId === 'string') void socket.leave(rooms.channel(channelId));
  });

  socket.on('chat:typing', async (channelId) => {
    // Only for channels this socket was authorized to join; rate-limited per socket.
    const room = typeof channelId === 'string' ? rooms.channel(channelId) : null;
    const now = Date.now();
    if (!room || !socket.rooms.has(room) || now - lastTypingAt < TYPING_MIN_INTERVAL_MS) return;
    lastTypingAt = now;

    socket.data.displayName ??= (
      await prisma.user.findUnique({ where: { id: actor.userId }, select: { name: true } })
    )?.name;
    socket.to(room).emit('chat:typing', {
      channelId,
      user: { id: actor.userId, name: socket.data.displayName ?? '' },
    });
  });
}
