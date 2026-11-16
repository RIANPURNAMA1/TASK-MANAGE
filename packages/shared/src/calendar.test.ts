import { describe, expect, it } from 'vitest';
import { calendarQuerySchema } from './schemas';

const base = { from: '2026-11-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z' };

describe('calendarQuerySchema', () => {
  it('defaults to my tasks', () => {
    expect(calendarQuerySchema.parse(base).scope).toBe('mine');
  });

  it('accepts scope=all and a project filter', () => {
    const parsed = calendarQuerySchema.parse({ ...base, scope: 'all', projectId: 'cmabc123' });
    expect(parsed.scope).toBe('all');
    expect(parsed.projectId).toBe('cmabc123');
  });

  it('rejects an empty or reversed range', () => {
    expect(() => calendarQuerySchema.parse({ from: base.to, to: base.from })).toThrow();
    expect(() => calendarQuerySchema.parse({ from: base.from, to: base.from })).toThrow();
  });

  it('rejects ranges longer than 100 days', () => {
    expect(() => calendarQuerySchema.parse({ from: '2026-01-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' })).toThrow();
  });

  it('rejects non-datetime values and unknown scopes', () => {
    expect(() => calendarQuerySchema.parse({ from: 'kemarin', to: base.to })).toThrow();
    expect(() => calendarQuerySchema.parse({ ...base, scope: 'everyone' })).toThrow();
  });
});
