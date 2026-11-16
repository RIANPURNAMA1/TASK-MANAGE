import {
  addDays,
  differenceInCalendarDays,
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { MyTaskDTO } from '@nexus/shared';

export type CalendarView = 'month' | 'week' | 'agenda' | 'timeline';
export type CalendarScope = 'mine' | 'all';

/** Weeks start on Monday (Indonesian convention). */
export const WEEK_OPTS = { weekStartsOn: 1 as const };

export const dayKey = (date: Date): string => format(date, 'yyyy-MM-dd');
export const parseDayKey = (key: string): Date => parseISO(key);

export function isCalendarView(v: string | null): v is CalendarView {
  return v === 'month' || v === 'week' || v === 'agenda' || v === 'timeline';
}

/** The visible window: `from` inclusive, `to` exclusive, both in local time. */
export function rangeFor(view: CalendarView, anchor: Date): { from: Date; to: Date } {
  if (view === 'week') {
    const from = startOfWeek(anchor, WEEK_OPTS);
    return { from, to: addDays(from, 7) };
  }
  if (view === 'agenda' || view === 'timeline') {
    const from = startOfMonth(anchor);
    return { from, to: startOfMonth(addMonths(anchor, 1)) };
  }
  // Month grid shows whole weeks, including the neighbouring months' days.
  const from = startOfWeek(startOfMonth(anchor), WEEK_OPTS);
  const to = addDays(startOfDay(endOfWeek(endOfMonth(anchor), WEEK_OPTS)), 1);
  return { from, to };
}

export function shiftAnchor(view: CalendarView, anchor: Date, direction: 1 | -1): Date {
  return view === 'week' ? addWeeks(anchor, direction) : addMonths(anchor, direction);
}

export function daysIn(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  return days;
}

/** Longest span drawn on the grid; guards against a mistyped start date years in the past. */
const MAX_SPAN_DAYS = 120;

/** First and last calendar day a card occupies (start..due, or just the due day). */
export function spanOf(task: MyTaskDTO): { first: Date; last: Date } | null {
  if (!task.dueDate) return null;
  const last = startOfDay(parseISO(task.dueDate));
  const start = task.startDate ? startOfDay(parseISO(task.startDate)) : last;
  const first = start > last || differenceInCalendarDays(last, start) > MAX_SPAN_DAYS ? last : start;
  return { first, last };
}

/** Where a card sits relative to one day cell: drives how the chip is joined across days. */
export function partOn(task: MyTaskDTO, day: Date): { isStart: boolean; isEnd: boolean; isRange: boolean } {
  const span = spanOf(task);
  if (!span) return { isStart: true, isEnd: true, isRange: false };
  return {
    isStart: dayKey(span.first) === dayKey(day),
    isEnd: dayKey(span.last) === dayKey(day),
    isRange: dayKey(span.first) !== dayKey(span.last),
  };
}

/** Cards grouped by every local day they span (a range appears on each of its days). */
export function groupByDay(tasks: MyTaskDTO[]): Map<string, MyTaskDTO[]> {
  const map = new Map<string, MyTaskDTO[]>();
  for (const task of tasks) {
    const span = spanOf(task);
    if (!span) continue;
    for (let d = span.first; d <= span.last; d = addDays(d, 1)) {
      const key = dayKey(d);
      const list = map.get(key) ?? [];
      list.push(task);
      map.set(key, list);
    }
  }
  // Ranges first (they read as bars), then by due time.
  for (const list of map.values()) {
    list.sort((a, b) => Number(Boolean(b.startDate)) - Number(Boolean(a.startDate)) || a.dueDate!.localeCompare(b.dueDate!));
  }
  return map;
}

/**
 * New dates after dragging a card from one day to another. Both ends shift by the same number of
 * days, so a range keeps its length and times of day are preserved.
 */
export function shiftedDates(task: MyTaskDTO, from: Date, to: Date): { startDate: string | null; dueDate: string } | null {
  if (!task.dueDate) return null;
  const delta = differenceInCalendarDays(to, from);
  if (delta === 0) return null;
  const shift = (iso: string) => addDays(parseISO(iso), delta).toISOString();
  return { startDate: task.startDate ? shift(task.startDate) : null, dueDate: shift(task.dueDate) };
}

export function periodLabel(view: CalendarView, anchor: Date, range: { from: Date; to: Date }): string {
  if (view !== 'week') return format(anchor, 'MMMM yyyy', { locale: localeId });
  const last = addDays(range.to, -1);
  const sameMonth = range.from.getMonth() === last.getMonth();
  const loc = { locale: localeId };
  return sameMonth
    ? `${format(range.from, 'd')}–${format(last, 'd MMM yyyy', loc)}`
    : `${format(range.from, 'd MMM', loc)} – ${format(last, 'd MMM yyyy', loc)}`;
}
