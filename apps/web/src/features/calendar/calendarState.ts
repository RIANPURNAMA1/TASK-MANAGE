import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  type CalendarView,
  dayKey,
  isCalendarView,
  parseDayKey,
  rangeFor,
  shiftAnchor,
} from './calendarUtils';

/** URL parameter names, so the calendar can live on its own page or inside a project board. */
export interface CalendarParamNames {
  view: string;
  date: string;
  sel: string;
}

const PAGE_PARAMS: CalendarParamNames = { view: 'view', date: 'date', sel: 'sel' };
/** Inside a project, `?view=` already picks Kanban/Tabel/Kalender, so use `cal`. */
export const BOARD_CALENDAR_PARAMS: CalendarParamNames = { view: 'cal', date: 'date', sel: 'sel' };

/**
 * Calendar view state (view, month/week being shown, highlighted day) kept in the URL so it
 * survives reloads and can be shared. Other query params (card, filters…) are left untouched.
 */
export function useCalendarParams(names: CalendarParamNames = PAGE_PARAMS, defaultView: CalendarView = 'month') {
  const [params, setParams] = useSearchParams();
  const rawView = params.get(names.view);
  const view: CalendarView = isCalendarView(rawView) ? rawView : defaultView;

  const anchor = useMemo(() => {
    const raw = params.get(names.date);
    const parsed = raw ? parseDayKey(raw) : new Date();
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [params, names.date]);

  // The highlighted day (side panel); defaults to the anchor day.
  const selected = useMemo(() => {
    const raw = params.get(names.sel);
    const parsed = raw ? parseDayKey(raw) : anchor;
    return Number.isNaN(parsed.getTime()) ? anchor : parsed;
  }, [params, names.sel, anchor]);

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);

  const setParam = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return {
    view,
    anchor,
    selected,
    range,
    params,
    setParam,
    setView: (next: CalendarView) => setParam({ [names.view]: next === defaultView ? null : next, [names.sel]: null }),
    select: (date: Date) => setParam({ [names.sel]: dayKey(date) }),
    go: (direction: 1 | -1) => setParam({ [names.date]: dayKey(shiftAnchor(view, anchor, direction)), [names.sel]: null }),
    goToday: () => setParam({ [names.date]: null, [names.sel]: null }),
    /** True when "today" is already inside the visible window (the "Hari ini" button is then idle). */
    showingToday: range.from <= new Date() && new Date() < range.to && !params.get(names.date),
  };
}

export type CalendarParams = ReturnType<typeof useCalendarParams>;
