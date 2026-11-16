import type { Prisma, Tx } from '@nexus/db';
import {
  positionAfter,
  positionBetween,
  sortByPosition,
  type CardSummary,
  type CreateCardInput,
  type MoveCardInput,
  type UpdateCardInput,
} from '@nexus/shared';
import { badRequest } from '../../lib/errors';
import { sanitizeRichText } from '../../lib/sanitize';
import { transactional, type AfterCommit } from '../../lib/transaction';
import { realtime } from '../../realtime/emitter';
import type { Actor } from '../access/actor';
import { requireCard, requireProject } from '../access/access.service';
import { diffFields, recordActivity } from '../activity/activity.service';
import { notify } from '../notifications/notifications.service';
import { loadCardSummary } from './board.mapper';

type Origin = string | undefined;

/**
 * Loads the fresh summary and broadcasts it after commit. Also used by nested resources
 * (comments, checklist, files) whose counters appear on the board card.
 */
export async function publishCard(tx: Tx, afterCommit: AfterCommit, cardId: string, origin: Origin): Promise<CardSummary> {
  const card = await loadCardSummary(tx, cardId);
  afterCommit(() => {
    realtime.toProject(card.projectId, 'card:upserted', { projectId: card.projectId, card }, origin);
    realtime.toProject(card.projectId, 'card:detail-changed', { projectId: card.projectId, cardId }, origin);
  });
  return card;
}

async function requireActiveList(tx: Tx, projectId: string, listId: string) {
  const list = await tx.boardList.findFirst({ where: { id: listId, projectId, archivedAt: null } });
  if (!list) throw badRequest('Kolom tidak ditemukan di project ini');
  return list;
}

async function lastCardPosition(tx: Tx, listId: string): Promise<string | null> {
  const cards = await tx.card.findMany({ where: { listId }, select: { position: true } });
  return sortByPosition(cards).at(-1)?.position ?? null;
}

export async function createCard(actor: Actor, projectId: string, input: CreateCardInput, origin: Origin): Promise<CardSummary> {
  await requireProject(actor, projectId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    await requireActiveList(tx, projectId, input.listId);
    const card = await tx.card.create({
      data: {
        projectId,
        listId: input.listId,
        title: input.title,
        createdById: actor.userId,
        position: positionAfter(await lastCardPosition(tx, input.listId)),
      },
    });
    await recordActivity(tx, {
      projectId, cardId: card.id, actorId: actor.userId, entityType: 'card', entityId: card.id,
      action: 'card.created', diff: { title: card.title },
    });
    return publishCard(tx, afterCommit, card.id, origin);
  });
}

export async function updateCard(actor: Actor, cardId: string, input: UpdateCardInput, origin: Origin): Promise<CardSummary> {
  await requireCard(actor, cardId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const before = await tx.card.findUniqueOrThrow({ where: { id: cardId } });

    const changes: Pick<Prisma.CardUncheckedUpdateInput, 'title' | 'priority' | 'startDate' | 'dueDate' | 'completedAt'> & {
      description?: string | null;
    } = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.priority !== undefined) changes.priority = input.priority;
    if (input.description !== undefined) changes.description = sanitizeRichText(input.description);
    if (input.startDate !== undefined) changes.startDate = input.startDate ? new Date(input.startDate) : null;
    if (input.dueDate !== undefined) changes.dueDate = input.dueDate ? new Date(input.dueDate) : null;
    // A range must run forwards: the start can't be after the due date.
    const start = changes.startDate !== undefined ? changes.startDate : before.startDate;
    const due = changes.dueDate !== undefined ? changes.dueDate : before.dueDate;
    if (start && due && start > due) throw badRequest('Tanggal mulai tidak boleh setelah tenggat.');
    if (input.completed !== undefined && input.completed !== (before.completedAt !== null)) {
      changes.completedAt = input.completed ? new Date() : null;
    }

    await tx.card.update({
      where: { id: cardId },
      data: {
        ...changes,
        // A new due date deserves new reminders (FR-24).
        ...(changes.dueDate !== undefined && { dueReminderSentAt: null, overdueNotifiedAt: null }),
      },
    });

    const { description, ...tracked } = changes;
    const diff = diffFields(before, tracked);
    if (description !== undefined && description !== before.description) diff.description = 'updated';

    if (Object.keys(diff).length > 0) {
      const action =
        changes.completedAt === undefined ? 'card.updated' : changes.completedAt ? 'card.completed' : 'card.reopened';
      await recordActivity(tx, {
        projectId: before.projectId, cardId, actorId: actor.userId, entityType: 'card', entityId: cardId, action, diff,
      });
    }
    return publishCard(tx, afterCommit, cardId, origin);
  });
}

/** Drag & drop (FR-10): the server derives the position from the neighbours at the drop point. */
export async function moveCard(actor: Actor, cardId: string, input: MoveCardInput, origin: Origin): Promise<CardSummary> {
  const { entity } = await requireCard(actor, cardId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const target = await requireActiveList(tx, entity.projectId, input.listId);

    const neighbourIds = [input.prevId, input.nextId].filter((id): id is string => id !== null && id !== cardId);
    const neighbours = await tx.card.findMany({
      where: { id: { in: neighbourIds }, listId: target.id },
      select: { id: true, position: true },
    });
    if (neighbours.length !== neighbourIds.length) throw badRequest('Posisi kartu tidak valid');
    const positionOf = (id: string | null) => (id ? (neighbours.find((n) => n.id === id)?.position ?? null) : null);

    await tx.card.update({
      where: { id: cardId },
      data: { listId: target.id, position: positionBetween(positionOf(input.prevId), positionOf(input.nextId)) },
    });

    if (entity.listId !== target.id) {
      const from = await tx.boardList.findUniqueOrThrow({ where: { id: entity.listId }, select: { name: true } });
      await recordActivity(tx, {
        projectId: entity.projectId, cardId, actorId: actor.userId, entityType: 'card', entityId: cardId,
        action: 'card.moved', diff: { list: { from: from.name, to: target.name } },
      });
    }
    return publishCard(tx, afterCommit, cardId, origin);
  });
}

/** Replaces the assignee set (FR-09). Only project members can be assigned; new assignees are notified. */
export async function setAssignees(actor: Actor, cardId: string, userIds: string[], origin: Origin): Promise<CardSummary> {
  const { entity } = await requireCard(actor, cardId, 'canEdit');
  const wanted = [...new Set(userIds)];

  return transactional(async (tx, afterCommit) => {
    const members = await tx.projectMember.count({
      where: { projectId: entity.projectId, userId: { in: wanted }, user: { deactivatedAt: null } },
    });
    if (members !== wanted.length) throw badRequest('Assignee harus anggota project');

    const current = await tx.cardAssignee.findMany({ where: { cardId }, select: { userId: true } });
    const currentIds = new Set(current.map((a) => a.userId));
    const added = wanted.filter((id) => !currentIds.has(id));
    const removed = [...currentIds].filter((id) => !wanted.includes(id));

    if (removed.length) await tx.cardAssignee.deleteMany({ where: { cardId, userId: { in: removed } } });
    if (added.length) await tx.cardAssignee.createMany({ data: added.map((userId) => ({ cardId, userId })) });

    if (added.length || removed.length) {
      await recordActivity(tx, {
        projectId: entity.projectId, cardId, actorId: actor.userId, entityType: 'card', entityId: cardId,
        action: 'card.assignees_changed', diff: { added, removed },
      });
      const project = await tx.project.findUniqueOrThrow({ where: { id: entity.projectId }, select: { name: true } });
      await notify(tx, afterCommit, added.map((userId) => ({
        userId,
        type: 'CARD_ASSIGNED',
        actorId: actor.userId,
        projectId: entity.projectId,
        cardId,
        data: { cardTitle: entity.title, projectName: project.name },
      })));
    }
    return publishCard(tx, afterCommit, cardId, origin);
  });
}

export async function setCardLabels(actor: Actor, cardId: string, labelIds: string[], origin: Origin): Promise<CardSummary> {
  const { entity } = await requireCard(actor, cardId, 'canEdit');
  const wanted = [...new Set(labelIds)];

  return transactional(async (tx, afterCommit) => {
    const labels = await tx.label.findMany({
      where: { id: { in: wanted }, projectId: entity.projectId },
      select: { name: true },
    });
    if (labels.length !== wanted.length) throw badRequest('Label tidak ditemukan di project ini');

    await tx.cardLabel.deleteMany({ where: { cardId } });
    if (wanted.length) await tx.cardLabel.createMany({ data: wanted.map((labelId) => ({ cardId, labelId })) });
    await recordActivity(tx, {
      projectId: entity.projectId, cardId, actorId: actor.userId, entityType: 'card', entityId: cardId,
      action: 'card.labels_changed', diff: { labels: labels.map((l) => l.name) },
    });
    return publishCard(tx, afterCommit, cardId, origin);
  });
}

/** Archive / restore (FR-13). Archived cards disappear from the board but keep all their data. */
export async function setCardArchived(actor: Actor, cardId: string, archived: boolean, origin: Origin): Promise<CardSummary> {
  const { entity } = await requireCard(actor, cardId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    if (!archived) {
      // Restoring into an archived column would make the card invisible; send it to the first active one.
      const list = await tx.boardList.findUniqueOrThrow({ where: { id: entity.listId } });
      if (list.archivedAt) {
        const fallback = sortByPosition(
          await tx.boardList.findMany({ where: { projectId: entity.projectId, archivedAt: null } }),
        )[0];
        if (!fallback) throw badRequest('Tidak ada kolom aktif untuk memulihkan kartu');
        await tx.card.update({
          where: { id: cardId },
          data: { listId: fallback.id, position: positionAfter(await lastCardPosition(tx, fallback.id)) },
        });
      }
    }
    await tx.card.update({ where: { id: cardId }, data: { archivedAt: archived ? new Date() : null } });
    await recordActivity(tx, {
      projectId: entity.projectId, cardId, actorId: actor.userId, entityType: 'card', entityId: cardId,
      action: archived ? 'card.archived' : 'card.restored', diff: { title: entity.title },
    });

    const card = await loadCardSummary(tx, cardId);
    afterCommit(() => {
      if (archived) realtime.toProject(card.projectId, 'card:removed', { projectId: card.projectId, cardId }, origin);
      else realtime.toProject(card.projectId, 'card:upserted', { projectId: card.projectId, card }, origin);
      realtime.toProject(card.projectId, 'card:detail-changed', { projectId: card.projectId, cardId }, origin);
    });
    return card;
  });
}
