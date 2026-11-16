import {
  differenceInCalendarDays,
  format,
  formatDistanceToNow,
  isPast,
  isToday,
  isTomorrow,
  parseISO,
} from 'date-fns';
import { id } from 'date-fns/locale';

export type DueStatus = 'none' | 'done' | 'overdue' | 'today' | 'soon' | 'later';

export function dueStatus(dueDate: string | null, completedAt: string | null): DueStatus {
  if (!dueDate) return 'none';
  if (completedAt) return 'done';
  const date = parseISO(dueDate);
  if (isPast(date) && !isToday(date)) return 'overdue';
  if (isToday(date)) return isPast(date) ? 'overdue' : 'today';
  return differenceInCalendarDays(date, new Date()) <= 7 ? 'soon' : 'later';
}

export function formatDue(dueDate: string): string {
  const date = parseISO(dueDate);
  if (isToday(date)) return `Hari ini, ${format(date, 'HH:mm')}`;
  if (isTomorrow(date)) return `Besok, ${format(date, 'HH:mm')}`;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return format(date, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: id });
}

export function formatDateTime(value: string): string {
  return format(parseISO(value), "d MMM yyyy, HH:mm", { locale: id });
}

export function formatRelative(value: string): string {
  return formatDistanceToNow(parseISO(value), { addSuffix: true, locale: id });
}

/** ISO string → value for `<input type="datetime-local">` in local time. */
export function toDateTimeLocal(value: string | null): string {
  return value ? format(parseISO(value), "yyyy-MM-dd'T'HH:mm") : '';
}

/** `<input type="datetime-local">` value → ISO string with offset, or null when empty. */
export function fromDateTimeLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const second = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + second).toUpperCase();
}
