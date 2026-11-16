import { prisma, toUserSummary, userSummarySelect } from '@nexus/db';
import { sortByPosition, type ArchivedItems, type BoardData, type CardDetail } from '@nexus/shared';
import type { Actor } from '../access/actor';
import { requireCard, requireProject } from '../access/access.service';
import { toAttachmentDTO, attachmentInclude } from '../attachments/attachment.mapper';
import { getProject } from '../projects/projects.service';
import { cardSummaryInclude, sortedCards, toCardSummary, toLabelDTO, toListDTO } from './board.mapper';

/**
 * Whole board in one round trip (NFR-02: 500 cards < 1.5 s). Four indexed queries run
 * in parallel; ordering by fractional position is done in code (byte-wise).
 */
export async function getBoard(actor: Actor, projectId: string): Promise<BoardData> {
  await requireProject(actor, projectId, 'canView');

  const [project, lists, cards, labels, members] = await Promise.all([
    getProject(actor, projectId),
    prisma.boardList.findMany({ where: { projectId, archivedAt: null } }),
    prisma.card.findMany({
      where: { projectId, archivedAt: null, list: { archivedAt: null } },
      include: cardSummaryInclude,
    }),
    prisma.label.findMany({ where: { projectId }, orderBy: { name: 'asc' } }),
    prisma.projectMember.findMany({
      where: { projectId, user: { deactivatedAt: null } },
      include: { user: { select: userSummarySelect } },
      orderBy: { user: { name: 'asc' } },
    }),
  ]);

  return {
    project,
    lists: sortByPosition(lists).map(toListDTO),
    cards: sortedCards(cards),
    labels: labels.map(toLabelDTO),
    members: members.map((m) => toUserSummary(m.user)),
  };
}

export async function getArchivedItems(actor: Actor, projectId: string): Promise<ArchivedItems> {
  await requireProject(actor, projectId, 'canView');
  const [lists, cards] = await Promise.all([
    prisma.boardList.findMany({ where: { projectId, archivedAt: { not: null } }, orderBy: { archivedAt: 'desc' } }),
    prisma.card.findMany({
      where: { projectId, archivedAt: { not: null } },
      include: cardSummaryInclude,
      orderBy: { archivedAt: 'desc' },
      take: 200,
    }),
  ]);
  return { lists: lists.map(toListDTO), cards: cards.map(toCardSummary) };
}

export async function getCardDetail(actor: Actor, cardId: string): Promise<CardDetail> {
  const { access } = await requireCard(actor, cardId, 'canView');
  const card = await prisma.card.findUniqueOrThrow({
    where: { id: cardId },
    include: {
      ...cardSummaryInclude,
      createdBy: { select: userSummarySelect },
      list: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, color: true } },
      checklist: true,
      attachments: {
        where: { deletedAt: null, status: 'READY', commentId: null },
        include: attachmentInclude,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  return {
    ...toCardSummary(card),
    description: card.description,
    createdBy: toUserSummary(card.createdBy),
    createdAt: card.createdAt.toISOString(),
    list: card.list,
    project: card.project,
    checklistItems: sortByPosition(card.checklist).map((item) => ({
      id: item.id,
      title: item.title,
      isDone: item.isDone,
      position: item.position,
    })),
    attachments: card.attachments.map(toAttachmentDTO),
    access,
  };
}
