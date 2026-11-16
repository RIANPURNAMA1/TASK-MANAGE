import type { NotificationDTO } from '@nexus/shared';

/** Where activating a notification leads: a chat channel or a card. */
export function notificationPath(n: NotificationDTO): string | null {
  if (n.data.announcementId) return `/announcements/${n.data.announcementId}`;
  if (n.data.channelId) return `/chat/${n.data.channelId}`;
  if (n.projectId && n.cardId) return `/projects/${n.projectId}?card=${n.cardId}`;
  return null;
}

/** Indonesian title/body for each notification type (in-app list, toast and OS notification). */
export function notificationText(n: NotificationDTO): { title: string; body: string } {
  const actor = n.actor?.name ?? 'Seseorang';
  const card = n.data.cardTitle ? `"${n.data.cardTitle}"` : 'sebuah kartu';
  switch (n.type) {
    case 'CARD_ASSIGNED':
      return { title: `${actor} menugaskan Anda`, body: `Anda menjadi assignee di ${card}` };
    case 'MENTIONED':
      return { title: `${actor} menyebut Anda`, body: n.data.excerpt ?? `di ${card}` };
    case 'COMMENT_ADDED':
      return { title: `${actor} berkomentar di ${card}`, body: n.data.excerpt ?? '' };
    case 'DUE_SOON':
      return { title: 'Tenggat besok', body: `${card} jatuh tempo dalam 24 jam` };
    case 'OVERDUE':
      return { title: 'Tugas terlambat', body: `${card} sudah melewati tenggat` };
    case 'CHAT_MENTION':
      return { title: `${actor} menyebut Anda di #${n.data.channelName ?? 'chat'}`, body: n.data.excerpt ?? '' };
    case 'ANNOUNCEMENT': {
      const title = `"${n.data.announcementTitle ?? 'Pengumuman'}"`;
      return n.data.announcementKind === 'comment'
        ? { title: `${actor} mengomentari pengumuman ${title}`, body: n.data.excerpt ?? '' }
        : { title: `Pengumuman baru · ${n.data.scopeLabel ?? 'Perusahaan'}`, body: `${actor}: ${n.data.announcementTitle ?? ''}` };
    }
  }
}
