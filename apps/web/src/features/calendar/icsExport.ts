import { addDays, addMinutes, format, parseISO, startOfDay } from 'date-fns';
import type { MyTaskDTO } from '@nexus/shared';

/** iCalendar text values: escape backslash, semicolon, comma and newlines (RFC 5545 §3.3.11). */
function text(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Lines longer than 75 octets must be folded with CRLF + space (RFC 5545 §3.1). */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (encoder.encode(current + ch).length > limit) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const utc = (date: Date) => format(new Date(date.getTime() + date.getTimezoneOffset() * 60000), "yyyyMMdd'T'HHmmss'Z'");
const dateOnly = (date: Date) => format(date, 'yyyyMMdd');

/**
 * Builds an .ics file from calendar tasks, importable into Google Calendar, Outlook or Apple
 * Calendar. A card with a start date becomes an all-day event spanning start..due; a card with
 * only a due date becomes a 30-minute event ending at its due time.
 */
export function buildIcs(tasks: MyTaskDTO[], origin: string): string {
  const stamp = utc(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mendunia Workbase//Kalender//ID', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Mendunia Workbase'];

  for (const task of tasks) {
    if (!task.dueDate) continue;
    const due = parseISO(task.dueDate);
    lines.push('BEGIN:VEVENT', `UID:${task.id}@mendunia-workbase`, `DTSTAMP:${stamp}`);
    if (task.startDate) {
      // All-day range; DTEND is exclusive, so it is the day after the due day.
      lines.push(`DTSTART;VALUE=DATE:${dateOnly(parseISO(task.startDate))}`, `DTEND;VALUE=DATE:${dateOnly(addDays(startOfDay(due), 1))}`);
    } else {
      lines.push(`DTSTART:${utc(addMinutes(due, -30))}`, `DTEND:${utc(due)}`);
    }
    lines.push(`SUMMARY:${text(task.completedAt ? `✓ ${task.title}` : task.title)}`);
    lines.push(`DESCRIPTION:${text(`${task.project.name} · ${task.list.name}\n${origin}/projects/${task.projectId}?card=${task.id}`)}`);
    lines.push(`URL:${origin}/projects/${task.projectId}?card=${task.id}`);
    lines.push(`STATUS:${task.completedAt ? 'CONFIRMED' : 'TENTATIVE'}`, 'END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

export function downloadIcs(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
