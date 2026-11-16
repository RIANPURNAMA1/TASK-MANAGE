import { createCommentSchema, updateCommentSchema } from '@nexus/shared';
import { Router } from 'express';
import { actorOf, param, parseBody } from '../../lib/http';
import { createComment, deleteComment, listComments, updateComment } from './comments.service';

export const commentsRouter = Router();

commentsRouter.get('/cards/:id/comments', async (req, res) => {
  res.json(await listComments(actorOf(req), param(req, 'id')));
});

commentsRouter.post('/cards/:id/comments', async (req, res) => {
  res.status(201).json(await createComment(actorOf(req), param(req, 'id'), parseBody(createCommentSchema, req), req.socketId));
});

commentsRouter.patch('/comments/:id', async (req, res) => {
  res.json(await updateComment(actorOf(req), param(req, 'id'), parseBody(updateCommentSchema, req), req.socketId));
});

commentsRouter.delete('/comments/:id', async (req, res) => {
  await deleteComment(actorOf(req), param(req, 'id'), req.socketId);
  res.status(204).end();
});
