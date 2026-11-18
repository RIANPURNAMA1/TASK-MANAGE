import { createInvitationSchema, createUserSchema, deactivateUserSchema, updateOrgRoleSchema } from '@nexus/shared';
import { Router } from 'express';
import { z } from 'zod';
import { actorOf, clientIp, param, parseBody, parseQuery } from '../../lib/http';
import { requireOrgAdmin } from '../access/access.service';
import { createInvitation, listInvitations, revokeInvitation } from '../invitations/invitations.service';
import { createUser, deactivateUser, listUsers, reactivateUser, revokeSessionsOf, setOrgRole } from './admin.service';

/** Owner/Admin only. Every handler re-checks the role in its service as well. */
export const adminRouter = Router();

adminRouter.use((req, _res, next) => {
  requireOrgAdmin(actorOf(req));
  next();
});

const usersQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'deactivated']).optional(),
});

adminRouter.get('/users', async (req, res) => {
  res.json(await listUsers(actorOf(req), parseQuery(usersQuerySchema, req)));
});

adminRouter.post('/users', async (req, res) => {
  res.status(201).json(await createUser(actorOf(req), parseBody(createUserSchema, req), clientIp(req)));
});

adminRouter.patch('/users/:id', async (req, res) => {
  const { role } = parseBody(updateOrgRoleSchema, req);
  res.json(await setOrgRole(actorOf(req), param(req, 'id'), role, clientIp(req)));
});

adminRouter.post('/users/:id/deactivate', async (req, res) => {
  const { transferToUserId } = parseBody(deactivateUserSchema, req);
  res.json(await deactivateUser(actorOf(req), param(req, 'id'), transferToUserId, clientIp(req)));
});

adminRouter.post('/users/:id/reactivate', async (req, res) => {
  res.json(await reactivateUser(actorOf(req), param(req, 'id'), clientIp(req)));
});

adminRouter.post('/users/:id/revoke-sessions', async (req, res) => {
  await revokeSessionsOf(actorOf(req), param(req, 'id'), clientIp(req));
  res.status(204).end();
});

adminRouter.get('/invitations', async (req, res) => {
  res.json(await listInvitations(actorOf(req)));
});

adminRouter.post('/invitations', async (req, res) => {
  res.status(201).json(await createInvitation(actorOf(req), parseBody(createInvitationSchema, req), clientIp(req)));
});

adminRouter.delete('/invitations/:id', async (req, res) => {
  await revokeInvitation(actorOf(req), param(req, 'id'), clientIp(req));
  res.status(204).end();
});
