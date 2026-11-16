import type { Request } from 'express';
import type { z } from 'zod';
import { unauthenticated } from './errors';
import type { Actor } from '../modules/access/actor';

/** Parses with zod; a ZodError is turned into a 400 by the error handler. */
export function parseBody<S extends z.ZodTypeAny>(schema: S, req: Request): z.output<S> {
  return schema.parse(req.body ?? {});
}

export function parseQuery<S extends z.ZodTypeAny>(schema: S, req: Request): z.output<S> {
  return schema.parse(req.query);
}

/** Route params are typed as string by Express 5 but may still be arrays for wildcards. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value.join('/') : String(value ?? '');
}

/** The authenticated caller. Only valid behind the `authenticate` middleware. */
export function actorOf(req: Request): Actor {
  if (!req.actor) throw unauthenticated();
  return req.actor;
}

export function clientIp(req: Request): string | null {
  return req.ip ?? null;
}
