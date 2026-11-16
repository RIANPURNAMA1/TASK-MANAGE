import { prisma } from '@nexus/db';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { allowedOrigins, config, env } from './config/env';
import { logger } from './lib/logger';
import { createLimiter, rateLimit } from './lib/rate-limit';
import { getRedis } from './lib/redis';
import { localStorageRouter, STORAGE_PUBLIC_PATH } from './lib/storage';
import { authenticate } from './middleware/authenticate';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { adminRouter } from './modules/admin/admin.routes';
import { announcementsRouter } from './modules/announcements/announcements.routes';
import { attachmentsRouter } from './modules/attachments/attachments.routes';
import { authRouter } from './modules/auth/auth.routes';
import { boardRouter } from './modules/board/board.routes';
import { chatRouter } from './modules/chat/chat.routes';
import { commentsRouter } from './modules/comments/comments.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';
import { divisionsRouter } from './modules/divisions/divisions.routes';
import { invitationsRouter } from './modules/invitations/invitations.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { projectsRouter } from './modules/projects/projects.routes';
import { avatarsRouter, usersRouter } from './modules/users/users.routes';

export function createApp() {
  const app = express();

  // Behind Nginx / Cloudflare: trust the first proxy hop for req.ip and secure cookies.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // Files and avatars are also shown by the desktop webview (another origin), so resources
  // may be embedded cross-origin; access is still gated by signed URLs / random names.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  // Local file storage streams raw bodies, so it is mounted before the JSON parser.
  if (localStorageRouter) app.use(STORAGE_PUBLIC_PATH, localStorageRouter);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser(env.COOKIE_SECRET));
  if (!config.isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));

  // Liveness + dependency check for the uptime monitor (NFR-11).
  app.get('/health', async (_req, res) => {
    const client = getRedis();
    const [db, redis] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, client ? client.ping() : 'disabled']);
    const ok = db.status === 'fulfilled' && redis.status === 'fulfilled';
    res.status(ok ? 200 : 503).json({
      status: ok ? 'ok' : 'degraded',
      database: db.status === 'fulfilled' ? 'up' : 'down',
      redis: !client ? 'disabled' : redis.status === 'fulfilled' ? 'up' : 'down',
    });
  });

  // Profile photos: public (see avatarsRouter), with their own budget since a page can show many.
  app.use(`${config.apiPrefix}/avatars`, rateLimit(createLimiter('avatars', 1200, 60)), avatarsRouter);

  const api = Router();
  api.use(rateLimit(createLimiter('api', 300, 60)));

  // Public
  api.use(authRouter);
  api.use(invitationsRouter);

  // Authenticated
  api.use(authenticate);
  api.use(usersRouter);
  api.use(dashboardRouter);
  api.use(announcementsRouter);
  api.use(divisionsRouter);
  api.use(projectsRouter);
  api.use(boardRouter);
  api.use(commentsRouter);
  api.use(attachmentsRouter);
  api.use(notificationsRouter);
  api.use('/chat', chatRouter);
  api.use('/admin', adminRouter);

  app.use(config.apiPrefix, api);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
