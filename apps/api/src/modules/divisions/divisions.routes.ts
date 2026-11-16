import {
  createDivisionSchema,
  DIVISION_ROLES,
  divisionMemberSchema,
  roleOnlySchema,
  updateDivisionSchema,
} from '@nexus/shared';
import { Router } from 'express';
import { actorOf, param, parseBody } from '../../lib/http';
import {
  addDivisionMember,
  archiveDivision,
  createDivision,
  listDivisionMembers,
  listDivisions,
  removeDivisionMember,
  updateDivision,
  updateDivisionMember,
} from './divisions.service';

export const divisionsRouter = Router();
const divisionRoleSchema = roleOnlySchema(DIVISION_ROLES);

divisionsRouter.get('/divisions', async (req, res) => {
  res.json(await listDivisions(actorOf(req)));
});

divisionsRouter.post('/divisions', async (req, res) => {
  res.status(201).json(await createDivision(actorOf(req), parseBody(createDivisionSchema, req)));
});

divisionsRouter.patch('/divisions/:id', async (req, res) => {
  res.json(await updateDivision(actorOf(req), param(req, 'id'), parseBody(updateDivisionSchema, req)));
});

divisionsRouter.delete('/divisions/:id', async (req, res) => {
  await archiveDivision(actorOf(req), param(req, 'id'));
  res.status(204).end();
});

divisionsRouter.get('/divisions/:id/members', async (req, res) => {
  res.json(await listDivisionMembers(actorOf(req), param(req, 'id')));
});

divisionsRouter.post('/divisions/:id/members', async (req, res) => {
  res.status(201).json(await addDivisionMember(actorOf(req), param(req, 'id'), parseBody(divisionMemberSchema, req)));
});

divisionsRouter.patch('/divisions/:id/members/:userId', async (req, res) => {
  const { role } = parseBody(divisionRoleSchema, req);
  res.json(await updateDivisionMember(actorOf(req), param(req, 'id'), param(req, 'userId'), role));
});

divisionsRouter.delete('/divisions/:id/members/:userId', async (req, res) => {
  await removeDivisionMember(actorOf(req), param(req, 'id'), param(req, 'userId'));
  res.status(204).end();
});
