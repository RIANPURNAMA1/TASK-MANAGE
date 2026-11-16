import { acceptInvitationSchema, type AcceptInvitationResult } from '@nexus/shared';
import { Router } from 'express';
import { param, parseBody } from '../../lib/http';
import { deviceOf, issueAuth } from '../auth/issue-auth';
import { acceptInvitation, previewInvitation } from './invitations.service';

/** Public endpoints used by the invite landing page. Admin management lives in the admin module. */
export const invitationsRouter = Router();

invitationsRouter.get('/invitations/:token', async (req, res) => {
  res.json(await previewInvitation(param(req, 'token')));
});

invitationsRouter.post('/invitations/:token/accept', async (req, res) => {
  const result = await acceptInvitation(param(req, 'token'), parseBody(acceptInvitationSchema, req), deviceOf(req));
  const body: AcceptInvitationResult = result.session
    ? { requiresVerification: false, auth: await issueAuth(req, res, { userId: result.userId, ...result.session }) }
    : { requiresVerification: true, auth: null };
  res.status(201).json(body);
});
