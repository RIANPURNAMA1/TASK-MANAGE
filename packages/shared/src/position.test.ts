import { describe, expect, it } from 'vitest';
import { comparePosition, positionAfter, positionBetween, sortByPosition } from './position';

describe('position', () => {
  it('generates keys that sort between neighbours', () => {
    const a = positionAfter(null);
    const c = positionAfter(a);
    const b = positionBetween(a, c);
    expect(comparePosition(a, b)).toBe(-1);
    expect(comparePosition(b, c)).toBe(-1);
  });

  it('places items at the start and end', () => {
    const middle = positionAfter(null);
    expect(comparePosition(positionBetween(null, middle), middle)).toBe(-1);
    expect(comparePosition(positionBetween(middle, null), middle)).toBe(1);
  });

  it('recovers when neighbours arrive out of order', () => {
    const a = positionAfter(null);
    const b = positionAfter(a);
    const key = positionBetween(b, a);
    expect(comparePosition(key, b)).toBe(1);
  });

  it('sorts byte-wise, not locale-wise', () => {
    // Uppercase sorts before lowercase in code-unit order.
    const sorted = sortByPosition([{ position: 'a0' }, { position: 'Zz' }, { position: 'a1' }]);
    expect(sorted.map((x) => x.position)).toEqual(['Zz', 'a0', 'a1']);
  });

  it('survives many inserts at the same spot', () => {
    let prev = positionAfter(null);
    const next = positionAfter(prev);
    for (let i = 0; i < 200; i++) {
      const key = positionBetween(prev, next);
      expect(comparePosition(prev, key)).toBe(-1);
      expect(comparePosition(key, next)).toBe(-1);
      prev = key;
    }
  });
});
