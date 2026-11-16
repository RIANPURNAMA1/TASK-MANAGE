import { avatarUploadSchema, changePasswordSchema, completeAvatarSchema, searchQuerySchema, updateMeSchema } from '@nexus/shared';
import { Router } from 'express';
import { actorOf, param, parseBody, parseQuery } from '../../lib/http';
import { avatarRedirect, completeAvatarUpload, presignAvatarUpload, removeAvatar } from './avatar.service';
import { listMyTasks } from '../board/my-tasks.service';
import { changePassword, loadMe, searchUsers, updateMe } from './users.service';

export const usersRouter = Router();

usersRouter.get('/me', async (req, res) => {
  res.json(await loadMe(actorOf(req).userId));
});

usersRouter.patch('/me', async (req, res) => {
  res.json(await updateMe(actorOf(req), parseBody(updateMeSchema, req)));
});

usersRouter.post('/me/password', async (req, res) => {
  await changePassword(actorOf(req), parseBody(changePasswordSchema, req));
  res.status(204).end();
});

usersRouter.post('/me/avatar', async (req, res) => {
  res.status(201).json(await presignAvatarUpload(actorOf(req), parseBody(avatarUploadSchema, req)));
});

usersRouter.post('/me/avatar/complete', async (req, res) => {
  res.json(await completeAvatarUpload(actorOf(req), parseBody(completeAvatarSchema, req).file));
});

usersRouter.delete('/me/avatar', async (req, res) => {
  res.json(await removeAvatar(actorOf(req)));
});

usersRouter.get('/me/tasks', async (req, res) => {
  res.json(await listMyTasks(actorOf(req)));
});

usersRouter.get('/users', async (req, res) => {
  const { q } = parseQuery(searchQuerySchema, req);
  res.json(await searchUsers(actorOf(req), q));
});

/**
 * Public on purpose: <img> tags cannot send the Bearer token. The file name is a
 * random 128-bit value and only the user's current avatar resolves (see avatar.service).
 */
export const avatarsRouter = Router();

avatarsRouter.get('/:userId/:file', async (req, res) => {
  const url = await avatarRedirect(param(req, 'userId'), param(req, 'file'));
  // Shorter than the signed URL's 5-minute lifetime so a cached redirect never points at an expired link.
  res.setHeader('Cache-Control', 'private, max-age=240');
  res.redirect(302, url);
});
