import {
  createProjectSchema,
  muteSchema,
  paginationSchema,
  PROJECT_ROLES,
  projectMemberSchema,
  roleOnlySchema,
  updateProjectSchema,
} from '@nexus/shared';
import { Router } from 'express';
import { z } from 'zod';
import { actorOf, param, parseBody, parseQuery } from '../../lib/http';
import { requireProject } from '../access/access.service';
import { listProjectActivity } from '../activity/activity.service';
import {
  addProjectMember,
  createProject,
  getProject,
  joinProject,
  listProjectMembers,
  listProjects,
  removeProjectMember,
  setProjectArchived,
  setProjectMuted,
  updateProject,
  updateProjectMember,
} from './projects.service';

export const projectsRouter = Router();
const projectRoleSchema = roleOnlySchema(PROJECT_ROLES);
const listQuerySchema = z.object({
  divisionId: z.string().optional(),
  archived: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

projectsRouter.get('/projects', async (req, res) => {
  res.json(await listProjects(actorOf(req), parseQuery(listQuerySchema, req)));
});

projectsRouter.post('/projects', async (req, res) => {
  res.status(201).json(await createProject(actorOf(req), parseBody(createProjectSchema, req)));
});

projectsRouter.get('/projects/:id', async (req, res) => {
  res.json(await getProject(actorOf(req), param(req, 'id')));
});

projectsRouter.patch('/projects/:id', async (req, res) => {
  res.json(await updateProject(actorOf(req), param(req, 'id'), parseBody(updateProjectSchema, req)));
});

projectsRouter.post('/projects/:id/archive', async (req, res) => {
  res.json(await setProjectArchived(actorOf(req), param(req, 'id'), true));
});

projectsRouter.post('/projects/:id/restore', async (req, res) => {
  res.json(await setProjectArchived(actorOf(req), param(req, 'id'), false));
});

projectsRouter.post('/projects/:id/join', async (req, res) => {
  res.json(await joinProject(actorOf(req), param(req, 'id')));
});

projectsRouter.put('/projects/:id/mute', async (req, res) => {
  res.json(await setProjectMuted(actorOf(req), param(req, 'id'), parseBody(muteSchema, req).muted));
});

projectsRouter.get('/projects/:id/activity', async (req, res) => {
  const actor = actorOf(req);
  const projectId = param(req, 'id');
  await requireProject(actor, projectId, 'canView');
  const { cursor, limit } = parseQuery(paginationSchema, req);
  res.json(await listProjectActivity(projectId, cursor, limit));
});

projectsRouter.get('/projects/:id/members', async (req, res) => {
  res.json(await listProjectMembers(actorOf(req), param(req, 'id')));
});

projectsRouter.post('/projects/:id/members', async (req, res) => {
  res.status(201).json(await addProjectMember(actorOf(req), param(req, 'id'), parseBody(projectMemberSchema, req)));
});

projectsRouter.patch('/projects/:id/members/:userId', async (req, res) => {
  const { role } = parseBody(projectRoleSchema, req);
  res.json(await updateProjectMember(actorOf(req), param(req, 'id'), param(req, 'userId'), role));
});

projectsRouter.delete('/projects/:id/members/:userId', async (req, res) => {
  await removeProjectMember(actorOf(req), param(req, 'id'), param(req, 'userId'));
  res.status(204).end();
});
