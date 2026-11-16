import { notificationQuerySchema } from '@nexus/shared';
import { Router } from 'express';
import { actorOf, param, parseQuery } from '../../lib/http';
import { listNotifications, markAllRead, markRead } from './notifications.service';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', async (req, res) => {
  res.json(await listNotifications(actorOf(req), parseQuery(notificationQuerySchema, req)));
});

notificationsRouter.post('/notifications/read-all', async (req, res) => {
  await markAllRead(actorOf(req));
  res.status(204).end();
});

notificationsRouter.post('/notifications/:id/read', async (req, res) => {
  await markRead(actorOf(req), param(req, 'id'));
  res.status(204).end();
});
