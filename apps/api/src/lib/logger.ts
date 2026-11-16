import pino from 'pino';
import { env } from '../config/env';

/** Structured JSON logs in production (NFR-11), pretty output in development. */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname' } },
  }),
});
