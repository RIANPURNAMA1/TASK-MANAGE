import { generateKeyBetween } from 'fractional-indexing';

/**
 * Fractional-index helpers for ordering lists, cards and checklist items.
 * Moving one item only rewrites that item's `position` (see PRD §7).
 *
 * Keys MUST be compared by code unit, never with `localeCompare`.
 */
export function comparePosition(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortByPosition<T extends { position: string }>(items: readonly T[]): T[] {
  return [...items].sort((x, y) => comparePosition(x.position, y.position));
}

/**
 * Key strictly between `prev` and `next` (either may be null for the ends).
 * Tolerates out-of-order neighbours caused by concurrent moves by falling back to
 * "right after prev", which is always valid.
 */
export function positionBetween(prev: string | null, next: string | null): string {
  if (prev !== null && next !== null && comparePosition(prev, next) >= 0) {
    return generateKeyBetween(prev, null);
  }
  return generateKeyBetween(prev, next);
}

export function positionAfter(last: string | null): string {
  return generateKeyBetween(last, null);
}
