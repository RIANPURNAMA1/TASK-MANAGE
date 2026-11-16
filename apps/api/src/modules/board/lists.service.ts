import type { Tx } from '@nexus/db';
import {
  positionAfter,
  positionBetween,
  sortByPosition,
  type CreateListInput,
  type ListDTO,
  type MoveListInput,
} from '@nexus/shared';
import { badRequest } from '../../lib/errors';
import { transactional } from '../../lib/transaction';
import { realtime } from '../../realtime/emitter';
import type { Actor } from '../access/actor';
import { requireList, requireProject } from '../access/access.service';
import { recordActivity } from '../activity/activity.service';
import { toListDTO } from './board.mapper';

/** Optional socket id of the caller, so real-time echoes skip the originating tab. */
type Origin = string | undefined;

async function lastListPosition(tx: Tx, projectId: string): Promise<string | null> {
  const lists = await tx.boardList.findMany({ where: { projectId }, select: { position: true } });
  return sortByPosition(lists).at(-1)?.position ?? null;
}

export async function createList(actor: Actor, projectId: string, input: CreateListInput, origin: Origin): Promise<ListDTO> {
  await requireProject(actor, projectId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const list = await tx.boardList.create({
      data: { projectId, name: input.name, position: positionAfter(await lastListPosition(tx, projectId)) },
    });
    await recordActivity(tx, {
      projectId, actorId: actor.userId, entityType: 'list', entityId: list.id,
      action: 'list.created', diff: { name: list.name },
    });
    const dto = toListDTO(list);
    afterCommit(() => realtime.toProject(projectId, 'list:upserted', { projectId, list: dto }, origin));
    return dto;
  });
}

export async function renameList(actor: Actor, listId: string, name: string, origin: Origin): Promise<ListDTO> {
  const { entity } = await requireList(actor, listId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const list = await tx.boardList.update({ where: { id: listId }, data: { name } });
    await recordActivity(tx, {
      projectId: list.projectId, actorId: actor.userId, entityType: 'list', entityId: list.id,
      action: 'list.renamed', diff: { name: { from: entity.name, to: name } },
    });
    const dto = toListDTO(list);
    afterCommit(() => realtime.toProject(list.projectId, 'list:upserted', { projectId: list.projectId, list: dto }, origin));
    return dto;
  });
}

/** Reorders a column between its new neighbours; only this row is written (fractional index). */
export async function moveList(actor: Actor, listId: string, input: MoveListInput, origin: Origin): Promise<ListDTO> {
  const { entity } = await requireList(actor, listId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const neighbourIds = [input.prevId, input.nextId].filter((id): id is string => id !== null);
    const neighbours = await tx.boardList.findMany({
      where: { id: { in: neighbourIds }, projectId: entity.projectId },
      select: { id: true, position: true },
    });
    if (neighbours.length !== neighbourIds.length) throw badRequest('Posisi kolom tidak valid');
    const positionOf = (id: string | null) => (id ? (neighbours.find((n) => n.id === id)?.position ?? null) : null);

    const list = await tx.boardList.update({
      where: { id: listId },
      data: { position: positionBetween(positionOf(input.prevId), positionOf(input.nextId)) },
    });
    const dto = toListDTO(list);
    afterCommit(() => realtime.toProject(list.projectId, 'list:upserted', { projectId: list.projectId, list: dto }, origin));
    return dto;
  });
}

export async function setListArchived(actor: Actor, listId: string, archived: boolean, origin: Origin): Promise<ListDTO> {
  await requireList(actor, listId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const list = await tx.boardList.update({
      where: { id: listId },
      data: { archivedAt: archived ? new Date() : null },
    });
    await recordActivity(tx, {
      projectId: list.projectId, actorId: actor.userId, entityType: 'list', entityId: list.id,
      action: archived ? 'list.archived' : 'list.restored', diff: { name: list.name },
    });
    const dto = toListDTO(list);
    afterCommit(() =>
      archived
        ? realtime.toProject(list.projectId, 'list:removed', { projectId: list.projectId, listId }, origin)
        : // A restored column brings its cards back; every client (including the caller) refetches the board.
          realtime.toProject(list.projectId, 'project:changed', { projectId: list.projectId }),
    );
    return dto;
  });
}
