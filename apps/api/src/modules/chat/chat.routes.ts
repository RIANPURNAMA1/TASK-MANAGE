import { editMessageSchema, messagesQuerySchema, openDirectSchema, reactionSchema, sendMessageSchema } from '@nexus/shared';
import { Router } from 'express';
import { actorOf, param, parseBody, parseQuery } from '../../lib/http';
import {
  getChannel,
  getProjectChannel,
  listChannels,
  markChannelRead,
  onlineUsers,
  openDirectChannel,
} from './channels.service';
import { deleteMessage, editMessage, listMessages, sendMessage, toggleReaction } from './messages.service';

/** Chat Tim (FR-31 – FR-34). Mounted under /chat. */
export const chatRouter = Router();

chatRouter.get('/channels', async (req, res) => {
  res.json(await listChannels(actorOf(req)));
});

chatRouter.get('/channels/:id', async (req, res) => {
  res.json(await getChannel(actorOf(req), param(req, 'id')));
});

chatRouter.post('/direct', async (req, res) => {
  res.json(await openDirectChannel(actorOf(req), parseBody(openDirectSchema, req).userId));
});

chatRouter.get('/projects/:id/channel', async (req, res) => {
  res.json(await getProjectChannel(actorOf(req), param(req, 'id')));
});

chatRouter.get('/channels/:id/messages', async (req, res) => {
  res.json(await listMessages(actorOf(req), param(req, 'id'), parseQuery(messagesQuerySchema, req)));
});

chatRouter.post('/channels/:id/messages', async (req, res) => {
  const { message, created } = await sendMessage(actorOf(req), param(req, 'id'), parseBody(sendMessageSchema, req));
  // 200 on an idempotent replay so clients can tell a retry from a fresh send.
  res.status(created ? 201 : 200).json(message);
});

chatRouter.post('/channels/:id/read', async (req, res) => {
  await markChannelRead(actorOf(req), param(req, 'id'));
  res.status(204).end();
});

chatRouter.patch('/messages/:id', async (req, res) => {
  res.json(await editMessage(actorOf(req), param(req, 'id'), parseBody(editMessageSchema, req)));
});

chatRouter.delete('/messages/:id', async (req, res) => {
  res.json(await deleteMessage(actorOf(req), param(req, 'id')));
});

chatRouter.post('/messages/:id/reactions', async (req, res) => {
  res.json(await toggleReaction(actorOf(req), param(req, 'id'), parseBody(reactionSchema, req).emoji));
});

chatRouter.get('/presence', async (req, res) => {
  res.json(await onlineUsers(actorOf(req)));
});
