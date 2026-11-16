import { describe, expect, it } from 'vitest';
import type { MyTaskDTO } from '@nexus/shared';
import { dayKey, groupByDay, partOn, shiftedDates, spanOf } from './calendarUtils';
import { buildIcs } from './icsExport';

function task(overrides: Partial<MyTaskDTO> = {}): MyTaskDTO {
  return {
    id: 'c1',
    projectId: 'p1',
    listId: 'l1',
    title: 'Rapat; "klien", Jakarta',
    priority: 'NONE',
    startDate: null,
    dueDate: '2026-11-18T10:00:00.000Z',
    position: 'a',
    completedAt: null,
    archivedAt: null,
    assignees: [],
    labels: [],
    checklist: { done: 0, total: 0 },
    checklistPreview: [],
    excerpt: null,
    commentCount: 0,
    attachmentCount: 0,
    updatedAt: '2026-11-01T00:00:00.000Z',
    project: { id: 'p1', name: 'Mendunia Workbase v1', color: '#2652A0', divisionName: 'Engineering' },
    list: { id: 'l1', name: 'In Progress' },
    ...overrides,
  };
}

// Local-time ISO strings, so the tests don't depend on the machine's timezone.
const local = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString();

describe('spanOf / groupByDay', () => {
  it('puts a due-date-only card on a single day', () => {
    const t = task({ dueDate: local(2026, 11, 18) });
    const map = groupByDay([t]);
    expect([...map.keys()]).toEqual(['2026-11-18']);
  });

  it('spreads a ranged card over every day from start to due', () => {
    const t = task({ startDate: local(2026, 11, 16), dueDate: local(2026, 11, 19) });
    expect([...groupByDay([t]).keys()]).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
  });

  it('ignores a start date after the due date instead of drawing a backwards bar', () => {
    const t = task({ startDate: local(2026, 11, 25), dueDate: local(2026, 11, 19) });
    const span = spanOf(t)!;
    expect(dayKey(span.first)).toBe('2026-11-19');
    expect(dayKey(span.last)).toBe('2026-11-19');
  });

  it('marks the first and last day of a range', () => {
    const t = task({ startDate: local(2026, 11, 16), dueDate: local(2026, 11, 18) });
    expect(partOn(t, new Date(2026, 10, 16))).toMatchObject({ isStart: true, isEnd: false, isRange: true });
    expect(partOn(t, new Date(2026, 10, 17))).toMatchObject({ isStart: false, isEnd: false });
    expect(partOn(t, new Date(2026, 10, 18))).toMatchObject({ isStart: false, isEnd: true });
  });
});

describe('shiftedDates', () => {
  it('moves both ends by the same number of days and keeps the length', () => {
    const t = task({ startDate: local(2026, 11, 16, 9), dueDate: local(2026, 11, 18, 17) });
    const next = shiftedDates(t, new Date(2026, 10, 16), new Date(2026, 10, 23))!;
    expect(new Date(next.startDate!).getDate()).toBe(23);
    expect(new Date(next.dueDate).getDate()).toBe(25);
    expect(new Date(next.dueDate).getHours()).toBe(17);
  });

  it('shifts by the pick-up day, so grabbing the middle of a range works', () => {
    const t = task({ startDate: local(2026, 11, 16), dueDate: local(2026, 11, 20) });
    const next = shiftedDates(t, new Date(2026, 10, 18), new Date(2026, 10, 19))!;
    expect(new Date(next.startDate!).getDate()).toBe(17);
    expect(new Date(next.dueDate).getDate()).toBe(21);
  });

  it('does nothing when dropped on the same day', () => {
    expect(shiftedDates(task({ dueDate: local(2026, 11, 18) }), new Date(2026, 10, 18), new Date(2026, 10, 18))).toBeNull();
  });
});

describe('buildIcs', () => {
  it('escapes text and uses CRLF line endings', () => {
    const ics = buildIcs([task()], 'https://app.example');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('SUMMARY:Rapat\\; "klien"\\, Jakarta');
    expect(ics).toContain('UID:c1@mendunia-workbase');
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('writes a ranged card as an all-day event with an exclusive end date', () => {
    const ics = buildIcs([task({ startDate: local(2026, 11, 16), dueDate: local(2026, 11, 18) })], 'https://app.example');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261116');
    expect(ics).toContain('DTEND;VALUE=DATE:20261119');
  });

  it('skips cards without a due date and folds long lines to 75 octets', () => {
    const long = task({ title: 'x'.repeat(200) });
    const ics = buildIcs([long, task({ id: 'c2', dueDate: null })], 'https://app.example');
    expect(ics).not.toContain('c2@mendunia-workbase');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
