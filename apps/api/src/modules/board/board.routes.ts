import {
  createCardSchema,
  createChecklistItemSchema,
  createListSchema,
  labelSchema,
  moveCardSchema,
  moveListSchema,
  setAssigneesSchema,
  setCardLabelsSchema,
  updateCardSchema,
  updateChecklistItemSchema,
  updateListSchema,
} from '@nexus/shared';
import { Router } from 'express';
import { actorOf, param, parseBody } from '../../lib/http';
import { requireCard } from '../access/access.service';
import { listCardActivity } from '../activity/activity.service';
import { getArchivedItems, getBoard, getCardDetail } from './board.service';
import {
  createCard,
  moveCard,
  setAssignees,
  setCardArchived,
  setCardLabels,
  updateCard,
} from './cards.service';
import { createChecklistItem, deleteChecklistItem, updateChecklistItem } from './checklist.service';
import { createLabel, deleteLabel, updateLabel } from './labels.service';
import { createList, moveList, renameList, setListArchived } from './lists.service';

export const boardRouter = Router();

// ─── board ────────────────────────────────────────────────────────────

boardRouter.get('/projects/:id/board', async (req, res) => {
  res.json(await getBoard(actorOf(req), param(req, 'id')));
});

boardRouter.get('/projects/:id/archived', async (req, res) => {
  res.json(await getArchivedItems(actorOf(req), param(req, 'id')));
});

// ─── lists (FR-08) ────────────────────────────────────────────────────

boardRouter.post('/projects/:id/lists', async (req, res) => {
  res.status(201).json(await createList(actorOf(req), param(req, 'id'), parseBody(createListSchema, req), req.socketId));
});

boardRouter.patch('/lists/:id', async (req, res) => {
  res.json(await renameList(actorOf(req), param(req, 'id'), parseBody(updateListSchema, req).name, req.socketId));
});

boardRouter.post('/lists/:id/move', async (req, res) => {
  res.json(await moveList(actorOf(req), param(req, 'id'), parseBody(moveListSchema, req), req.socketId));
});

boardRouter.post('/lists/:id/archive', async (req, res) => {
  res.json(await setListArchived(actorOf(req), param(req, 'id'), true, req.socketId));
});

boardRouter.post('/lists/:id/restore', async (req, res) => {
  res.json(await setListArchived(actorOf(req), param(req, 'id'), false, req.socketId));
});

// ─── labels ───────────────────────────────────────────────────────────

boardRouter.post('/projects/:id/labels', async (req, res) => {
  res.status(201).json(await createLabel(actorOf(req), param(req, 'id'), parseBody(labelSchema, req)));
});

boardRouter.patch('/labels/:id', async (req, res) => {
  res.json(await updateLabel(actorOf(req), param(req, 'id'), parseBody(labelSchema.partial(), req)));
});

boardRouter.delete('/labels/:id', async (req, res) => {
  await deleteLabel(actorOf(req), param(req, 'id'));
  res.status(204).end();
});

// ─── cards (FR-09, FR-10, FR-13) ──────────────────────────────────────

boardRouter.post('/projects/:id/cards', async (req, res) => {
  res.status(201).json(await createCard(actorOf(req), param(req, 'id'), parseBody(createCardSchema, req), req.socketId));
});

boardRouter.get('/cards/:id', async (req, res) => {
  res.json(await getCardDetail(actorOf(req), param(req, 'id')));
});

boardRouter.patch('/cards/:id', async (req, res) => {
  res.json(await updateCard(actorOf(req), param(req, 'id'), parseBody(updateCardSchema, req), req.socketId));
});

boardRouter.post('/cards/:id/move', async (req, res) => {
  res.json(await moveCard(actorOf(req), param(req, 'id'), parseBody(moveCardSchema, req), req.socketId));
});

boardRouter.put('/cards/:id/assignees', async (req, res) => {
  const { userIds } = parseBody(setAssigneesSchema, req);
  res.json(await setAssignees(actorOf(req), param(req, 'id'), userIds, req.socketId));
});

boardRouter.put('/cards/:id/labels', async (req, res) => {
  const { labelIds } = parseBody(setCardLabelsSchema, req);
  res.json(await setCardLabels(actorOf(req), param(req, 'id'), labelIds, req.socketId));
});

boardRouter.post('/cards/:id/archive', async (req, res) => {
  res.json(await setCardArchived(actorOf(req), param(req, 'id'), true, req.socketId));
});

boardRouter.post('/cards/:id/restore', async (req, res) => {
  res.json(await setCardArchived(actorOf(req), param(req, 'id'), false, req.socketId));
});

boardRouter.get('/cards/:id/activity', async (req, res) => {
  const cardId = param(req, 'id');
  await requireCard(actorOf(req), cardId, 'canView');
  res.json(await listCardActivity(cardId));
});

// ─── checklist (FR-11) ────────────────────────────────────────────────

boardRouter.post('/cards/:id/checklist', async (req, res) => {
  res.status(201).json(
    await createChecklistItem(actorOf(req), param(req, 'id'), parseBody(createChecklistItemSchema, req), req.socketId),
  );
});

boardRouter.patch('/checklist/:id', async (req, res) => {
  res.json(await updateChecklistItem(actorOf(req), param(req, 'id'), parseBody(updateChecklistItemSchema, req), req.socketId));
});

boardRouter.delete('/checklist/:id', async (req, res) => {
  await deleteChecklistItem(actorOf(req), param(req, 'id'), req.socketId);
  res.status(204).end();
});
