import type { Tx } from '@nexus/db';
import type { LabelDTO, LabelInput } from '@nexus/shared';
import { transactional, type AfterCommit } from '../../lib/transaction';
import { realtime } from '../../realtime/emitter';
import type { Actor } from '../access/actor';
import { requireLabel, requireProject } from '../access/access.service';
import { toLabelDTO } from './board.mapper';

/** Labels appear embedded in every card summary, so the board refreshes them as a set. */
async function broadcastLabels(tx: Tx, afterCommit: AfterCommit, projectId: string) {
  const labels = (await tx.label.findMany({ where: { projectId }, orderBy: { name: 'asc' } })).map(toLabelDTO);
  afterCommit(() => realtime.toProject(projectId, 'labels:changed', { projectId, labels }));
}

export async function createLabel(actor: Actor, projectId: string, input: LabelInput): Promise<LabelDTO> {
  await requireProject(actor, projectId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const label = await tx.label.create({ data: { projectId, ...input } });
    await broadcastLabels(tx, afterCommit, projectId);
    return toLabelDTO(label);
  });
}

export async function updateLabel(actor: Actor, labelId: string, input: Partial<LabelInput>): Promise<LabelDTO> {
  const { entity } = await requireLabel(actor, labelId, 'canEdit');
  return transactional(async (tx, afterCommit) => {
    const label = await tx.label.update({ where: { id: labelId }, data: input });
    await broadcastLabels(tx, afterCommit, entity.projectId);
    return toLabelDTO(label);
  });
}

export async function deleteLabel(actor: Actor, labelId: string): Promise<void> {
  const { entity } = await requireLabel(actor, labelId, 'canManage');
  await transactional(async (tx, afterCommit) => {
    await tx.label.delete({ where: { id: labelId } });
    await broadcastLabels(tx, afterCommit, entity.projectId);
  });
}
