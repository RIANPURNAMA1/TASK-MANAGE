import {
  announcementCommentSchema,
  announcementListQuerySchema,
  createAnnouncementSchema,
  pinAnnouncementSchema,
  updateAnnouncementSchema,
} from '@nexus/shared';
import { Router } from 'express';
import { actorOf, param, parseBody, parseQuery } from '../../lib/http';
import {
  addComment,
  countUnread,
  createAnnouncement,
  deleteAnnouncement,
  deleteComment,
  editComment,
  getAnnouncement,
  listAnnouncements,
  listComments,
  listTargets,
  markAllRead,
  markRead,
  setPinned,
  updateAnnouncement,
} from './announcements.service';

export const announcementsRouter = Router();

announcementsRouter.get('/announcements', async (req, res) => {
  res.json(await listAnnouncements(actorOf(req), parseQuery(announcementListQuerySchema, req)));
});

announcementsRouter.get('/announcements/unread-count', async (req, res) => {
  res.json({ count: await countUnread(actorOf(req)) });
});

announcementsRouter.get('/announcements/targets', async (req, res) => {
  res.json(await listTargets(actorOf(req)));
});

announcementsRouter.post('/announcements/read-all', async (req, res) => {
  await markAllRead(actorOf(req));
  res.status(204).end();
});

announcementsRouter.post('/announcements', async (req, res) => {
  res.status(201).json(await createAnnouncement(actorOf(req), parseBody(createAnnouncementSchema, req)));
});

announcementsRouter.get('/announcements/:id', async (req, res) => {
  res.json(await getAnnouncement(actorOf(req), param(req, 'id')));
});

announcementsRouter.patch('/announcements/:id', async (req, res) => {
  res.json(await updateAnnouncement(actorOf(req), param(req, 'id'), parseBody(updateAnnouncementSchema, req)));
});

announcementsRouter.delete('/announcements/:id', async (req, res) => {
  await deleteAnnouncement(actorOf(req), param(req, 'id'));
  res.status(204).end();
});

announcementsRouter.post('/announcements/:id/pin', async (req, res) => {
  res.json(await setPinned(actorOf(req), param(req, 'id'), parseBody(pinAnnouncementSchema, req).pinned));
});

announcementsRouter.post('/announcements/:id/read', async (req, res) => {
  await markRead(actorOf(req), param(req, 'id'));
  res.status(204).end();
});

announcementsRouter.get('/announcements/:id/comments', async (req, res) => {
  res.json(await listComments(actorOf(req), param(req, 'id')));
});

announcementsRouter.post('/announcements/:id/comments', async (req, res) => {
  res.status(201).json(await addComment(actorOf(req), param(req, 'id'), parseBody(announcementCommentSchema, req)));
});

announcementsRouter.patch('/announcement-comments/:id', async (req, res) => {
  res.json(await editComment(actorOf(req), param(req, 'id'), parseBody(announcementCommentSchema, req)));
});

announcementsRouter.delete('/announcement-comments/:id', async (req, res) => {
  await deleteComment(actorOf(req), param(req, 'id'));
  res.status(204).end();
});
