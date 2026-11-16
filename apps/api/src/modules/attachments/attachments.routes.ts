import { presignUploadSchema } from '@nexus/shared';
import { Router } from 'express';
import { z } from 'zod';
import { actorOf, param, parseBody, parseQuery } from '../../lib/http';
import {
  completeUpload,
  deleteAttachment,
  listProjectAttachments,
  presignUpload,
  signedUrl,
} from './attachments.service';

export const attachmentsRouter = Router();
const urlQuerySchema = z.object({ disposition: z.enum(['inline', 'attachment']).default('attachment') });

attachmentsRouter.get('/projects/:id/attachments', async (req, res) => {
  res.json(await listProjectAttachments(actorOf(req), param(req, 'id')));
});

attachmentsRouter.post('/projects/:id/attachments', async (req, res) => {
  res.status(201).json(await presignUpload(actorOf(req), param(req, 'id'), parseBody(presignUploadSchema, req)));
});

attachmentsRouter.post('/attachments/:id/complete', async (req, res) => {
  res.json(await completeUpload(actorOf(req), param(req, 'id'), req.socketId));
});

attachmentsRouter.get('/attachments/:id/url', async (req, res) => {
  const { disposition } = parseQuery(urlQuerySchema, req);
  res.json(await signedUrl(actorOf(req), param(req, 'id'), disposition));
});

attachmentsRouter.delete('/attachments/:id', async (req, res) => {
  await deleteAttachment(actorOf(req), param(req, 'id'), req.socketId);
  res.status(204).end();
});
