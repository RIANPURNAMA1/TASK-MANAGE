import {
  positionAfter,
  sortByPosition,
  type ChecklistItemDTO,
  type CreateChecklistItemInput,
  type UpdateChecklistItemInput,
} from '@nexus/shared';
import type { ChecklistItem } from '@nexus/db';
import { transactional } from '../../lib/transaction';
import type { Actor } from '../access/actor';
import { requireCard, requireChecklistItem } from '../access/access.service';
import { recordActivity } from '../activity/activity.service';
import { publishCard } from './cards.service';

type Origin = string | undefined;

function toDTO(item: ChecklistItem): ChecklistItemDTO {
  return { id: item.id, title: item.title, isDone: item.isDone, position: item.position };
}

/** Checklist / subtasks (FR-11). Progress is reflected on the board card, so each change republishes it. */
export async function createChecklistItem(actor: Actor, cardId: string, input: CreateChecklistItemInput, origin: Origin): Promise<ChecklistItemDTO> {
  const { entity } = await requireCard(actor, cardId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const last = sortByPosition(await tx.checklistItem.findMany({ where: { cardId }, select: { position: true } })).at(-1);
    const item = await tx.checklistItem.create({
      data: { cardId, title: input.title, position: positionAfter(last?.position ?? null) },
    });
    await recordActivity(tx, {
      projectId: entity.projectId, cardId, actorId: actor.userId, entityType: 'checklist', entityId: item.id,
      action: 'checklist.created', diff: { title: item.title },
    });
    await publishCard(tx, afterCommit, cardId, origin);
    return toDTO(item);
  });
}

export async function updateChecklistItem(actor: Actor, itemId: string, input: UpdateChecklistItemInput, origin: Origin): Promise<ChecklistItemDTO> {
  const { entity } = await requireChecklistItem(actor, itemId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const item = await tx.checklistItem.update({ where: { id: itemId }, data: input });
    if (input.isDone !== undefined && input.isDone !== entity.isDone) {
      await recordActivity(tx, {
        projectId: entity.projectId, cardId: entity.cardId, actorId: actor.userId, entityType: 'checklist',
        entityId: itemId, action: input.isDone ? 'checklist.checked' : 'checklist.unchecked', diff: { title: item.title },
      });
    }
    await publishCard(tx, afterCommit, entity.cardId, origin);
    return toDTO(item);
  });
}

export async function deleteChecklistItem(actor: Actor, itemId: string, origin: Origin): Promise<void> {
  const { entity } = await requireChecklistItem(actor, itemId, 'canEdit');
  await transactional(async (tx, afterCommit) => {
    await tx.checklistItem.delete({ where: { id: itemId } });
    await recordActivity(tx, {
      projectId: entity.projectId, cardId: entity.cardId, actorId: actor.userId, entityType: 'checklist',
      entityId: itemId, action: 'checklist.deleted', diff: { title: entity.title },
    });
    await publishCard(tx, afterCommit, entity.cardId, origin);
  });
}
