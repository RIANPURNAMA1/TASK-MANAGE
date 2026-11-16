import { differenceInMinutes, format, isSameDay, isToday, isYesterday, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import type { ChannelDetail, MessageDTO } from '@nexus/shared';
import { plainText } from '../../lib/chatMarkdown';

export function dayLabel(iso: string): string {
  const date = parseISO(iso);
  if (isToday(date)) return 'Hari ini';
  if (isYesterday(date)) return 'Kemarin';
  return format(date, 'EEEE, d MMMM yyyy', { locale: id });
}

export function timeLabel(iso: string): string {
  return format(parseISO(iso), 'HH:mm');
}

/** Sidebar timestamp: time today, otherwise a short date. */
export function shortStamp(iso: string): string {
  const date = parseISO(iso);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Kemarin';
  return format(date, 'd MMM', { locale: id });
}

export function previewText(body: string): string {
  return body.trim() ? plainText(body).replace(/\s+/g, ' ').trim() : '📎 Lampiran';
}

export interface MessageRow {
  message: MessageDTO;
  /** Day separator label to render above this message. */
  dayBreak: string | null;
  /** First message of a run by the same author: show avatar + name. */
  startsGroup: boolean;
}

const GROUP_WINDOW_MINUTES = 5;

/** Adds day separators and author grouping to an oldest-first list. */
export function toRows(messages: MessageDTO[]): MessageRow[] {
  return messages.map((message, i) => {
    const prev = messages[i - 1];
    const newDay = !prev || !isSameDay(parseISO(prev.createdAt), parseISO(message.createdAt));
    const startsGroup =
      newDay ||
      !prev ||
      prev.author.id !== message.author.id ||
      differenceInMinutes(parseISO(message.createdAt), parseISO(prev.createdAt)) >= GROUP_WINDOW_MINUTES;
    return { message, dayBreak: newDay ? dayLabel(message.createdAt) : null, startsGroup };
  });
}

/**
 * Read receipt for the caller's latest message (FR-33): "Dibaca" / "Terkirim" in DMs,
 * "Dibaca N orang" in project channels.
 */
export function readStatus(channel: ChannelDetail, message: MessageDTO, myId: string): string {
  const others = channel.members.filter((m) => m.user.id !== myId);
  const readers = others.filter((m) => m.lastReadAt && m.lastReadAt >= message.createdAt).length;
  if (channel.type === 'DIRECT') return readers > 0 ? 'Dibaca' : 'Terkirim';
  return readers > 0 ? `Dibaca ${readers} orang` : 'Terkirim';
}
