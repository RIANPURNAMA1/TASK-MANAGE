import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { rooms, type ClientToServerEvents, type ServerToClientEvents } from '@nexus/shared';
import { Server } from 'socket.io';
import { allowedOrigins, env } from '../config/env';
import { logger } from '../lib/logger';
import { getRedis } from '../lib/redis';
import { getProjectAccess } from '../modules/access/access.service';
import { resolveActor } from '../modules/auth/resolve-actor';
import { announcePresence, registerChatHandlers, type SocketData } from './chat-handlers';
import { bindRealtimeServer } from './emitter';

/**
 * Socket.IO, with the Redis adapter when Redis is configured so broadcasts reach clients
 * on every API instance (NFR-09). Authorization mirrors the REST API: the access token is
 * verified on connect and project membership is re-checked on every room join (PRD §8).
 */
export function createRealtimeServer(httpServer: HttpServer) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: allowedOrigins, credentials: true },
    serveClient: false,
  });

  // With Redis, broadcasts (including those published by the worker) reach every instance.
  const redis = getRedis();
  const pub = redis?.duplicate();
  const sub = redis?.duplicate();
  if (pub && sub) io.adapter(createAdapter(pub, sub));

  io.use(async (socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    const actor = await resolveActor(typeof token === 'string' ? token : undefined).catch(() => null);
    if (!actor) return next(new Error('UNAUTHENTICATED'));
    socket.data.actor = actor;
    next();
  });

  io.on('connection', (socket) => {
    const { actor } = socket.data;
    // join() is sync with the in-memory adapter and async with Redis.
    Promise.resolve(socket.join([rooms.user(actor.userId), rooms.session(actor.sessionId), rooms.org(actor.orgId)]))
      .then(() => announcePresence(io, socket, true))
      .catch((err: unknown) => logger.error({ err }, 'presence announce failed'));
    socket.on('disconnect', () => {
      announcePresence(io, socket, false).catch((err: unknown) => logger.error({ err }, 'presence announce failed'));
    });

    socket.on('project:join', async (projectId, ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      try {
        // Never trust the room id from the client: membership is checked against the database.
        const result = typeof projectId === 'string' ? await getProjectAccess(actor, projectId) : null;
        if (!result?.access.canView) return reply({ ok: false });
        await socket.join(rooms.project(projectId));
        reply({ ok: true });
      } catch (err) {
        logger.error({ err, projectId }, 'project:join failed');
        reply({ ok: false });
      }
    });

    socket.on('project:leave', (projectId) => {
      if (typeof projectId === 'string') void socket.leave(rooms.project(projectId));
    });

    registerChatHandlers(socket);
  });

  bindRealtimeServer(io as unknown as Parameters<typeof bindRealtimeServer>[0]);

  return {
    io,
    async close() {
      await io.close();
      await Promise.allSettled([pub?.quit(), sub?.quit()]);
    },
  };
}
