import { dashboardQuerySchema } from '@nexus/shared';
import { Router } from 'express';
import { actorOf, parseQuery } from '../../lib/http';
import { getDashboard } from './dashboard.service';

export const dashboardRouter = Router();

dashboardRouter.get('/dashboard', async (req, res) => {
  const { tz } = parseQuery(dashboardQuerySchema, req);
  res.json(await getDashboard(actorOf(req), tz));
});
