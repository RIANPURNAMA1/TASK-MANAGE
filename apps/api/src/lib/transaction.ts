import { prisma, type Tx } from '@nexus/db';
import { logger } from './logger';

type Effect = () => void | Promise<void>;
export type AfterCommit = (effect: Effect) => void;

/**
 * Runs `work` in a database transaction and executes side effects registered via
 * `afterCommit` only once the transaction has committed (PRD §6: real-time events are
 * sent after commit). Effects never fail the request; their errors are logged.
 */
export async function transactional<T>(
  work: (tx: Tx, afterCommit: AfterCommit) => Promise<T>,
): Promise<T> {
  const effects: Effect[] = [];
  const result = await prisma.$transaction((tx) => work(tx, (effect) => effects.push(effect)));

  for (const effect of effects) {
    try {
      await effect();
    } catch (err) {
      logger.error({ err }, 'after-commit effect failed');
    }
  }
  return result;
}
