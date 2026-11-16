import { SOCKET_ID_HEADER } from '@nexus/shared';
import type { RequestHandler } from 'express';
import { unauthenticated } from '../lib/errors';
import { resolveActor } from '../modules/auth/resolve-actor';

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  return header.slice('Bearer '.length).trim() || undefined;
}

/** Requires a valid access token; populates `req.actor`. */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const actor = await resolveActor(bearerToken(req.headers.authorization));
  if (!actor) throw unauthenticated();

  req.actor = actor;
  const socketId = req.headers[SOCKET_ID_HEADER];
  if (typeof socketId === 'string' && socketId.length <= 64) req.socketId = socketId;
  next();
};
