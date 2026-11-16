import { ORG_ROLE_LABEL, type NotificationType, type OrgRole } from '@nexus/shared';

/**
 * Transactional email templates (Indonesian). Inline styles only — email clients ignore
 * stylesheets. Every dynamic value goes through `escape`.
 */

export interface Email {
  subject: string;
  html: string;
  text: string;
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escape(cta.url)}" style="background:#2652A0;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${escape(cta.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#F8FAFC;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0F172A">
  <div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:32px">
    <div style="font-weight:700;font-size:18px;color:#2652A0;margin-bottom:24px">Mendunia Workbase</div>
    <h1 style="font-size:20px;margin:0 0 16px">${escape(title)}</h1>
    <div style="font-size:14px;line-height:1.6;color:#475569">${body}</div>
    ${button}
    <p style="font-size:12px;color:#94A3B8;margin-top:32px">Email ini dikirim otomatis oleh Mendunia Workbase. Atur preferensi email di menu Pengaturan.</p>
  </div></body></html>`;
}

export function verifyEmail(name: string, url: string): Email {
  return {
    subject: 'Verifikasi email Anda',
    html: layout(`Halo ${name},`, '<p>Klik tombol di bawah untuk memverifikasi email Anda. Link berlaku 24 jam.</p>', {
      label: 'Verifikasi email',
      url,
    }),
    text: `Halo ${name},\n\nVerifikasi email Anda: ${url}\n\nLink berlaku 24 jam.`,
  };
}

export function resetPassword(name: string, url: string): Email {
  return {
    subject: 'Reset password Mendunia Workbase',
    html: layout(
      `Halo ${name},`,
      '<p>Kami menerima permintaan reset password. Link berlaku 1 jam. Abaikan email ini jika Anda tidak memintanya.</p>',
      { label: 'Atur password baru', url },
    ),
    text: `Halo ${name},\n\nReset password Anda: ${url}\n\nLink berlaku 1 jam. Abaikan jika Anda tidak memintanya.`,
  };
}

export function invitation(inviter: string, organization: string, role: OrgRole, url: string): Email {
  const intro = `${escape(inviter)} mengundang Anda bergabung ke <strong>${escape(organization)}</strong> sebagai ${ORG_ROLE_LABEL[role]}.`;
  return {
    subject: `Undangan bergabung ke ${organization}`,
    html: layout('Anda diundang ke Mendunia Workbase', `<p>${intro}</p>`, { label: 'Terima undangan', url }),
    text: `${inviter} mengundang Anda bergabung ke ${organization} sebagai ${ORG_ROLE_LABEL[role]}.\n\nTerima undangan: ${url}`,
  };
}

export interface NotificationLine {
  type: NotificationType;
  actorName: string | null;
  /** Card title, the channel name for CHAT_MENTION, or the announcement title. */
  cardTitle: string;
  /** ANNOUNCEMENT only. */
  announcementKind?: 'posted' | 'comment';
  projectName: string;
  excerpt?: string;
  url: string;
}

export function describeNotification(n: Omit<NotificationLine, 'url'>): string {
  const actor = n.actorName ?? 'Seseorang';
  switch (n.type) {
    case 'CARD_ASSIGNED':
      return `${actor} menugaskan Anda ke "${n.cardTitle}"`;
    case 'MENTIONED':
      return `${actor} menyebut Anda di "${n.cardTitle}"`;
    case 'COMMENT_ADDED':
      return `${actor} mengomentari "${n.cardTitle}"`;
    case 'DUE_SOON':
      return `"${n.cardTitle}" jatuh tempo dalam 24 jam`;
    case 'OVERDUE':
      return `"${n.cardTitle}" sudah melewati tenggat`;
    case 'CHAT_MENTION':
      return `${actor} menyebut Anda di chat #${n.cardTitle}`;
    case 'ANNOUNCEMENT':
      return n.announcementKind === 'comment'
        ? `${actor} mengomentari pengumuman "${n.cardTitle}"`
        : `${actor} membuat pengumuman "${n.cardTitle}"`;
  }
}

export function singleNotification(n: NotificationLine): Email {
  const summary = describeNotification(n);
  const quote = n.excerpt
    ? `<blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #BFDBFE;background:#F0F7FF">${escape(n.excerpt)}</blockquote>`
    : '';
  return {
    subject: `[${n.projectName}] ${summary}`,
    html: layout(summary, `<p>Project: ${escape(n.projectName)}</p>${quote}`, { label: n.type === 'CHAT_MENTION' ? 'Buka chat' : n.type === 'ANNOUNCEMENT' ? 'Buka pengumuman' : 'Buka kartu', url: n.url }),
    text: `${summary}\nProject: ${n.projectName}\n${n.excerpt ?? ''}\n\n${n.url}`,
  };
}

export function dailyDigest(name: string, lines: NotificationLine[], appUrl: string): Email {
  const items = lines
    .map((l) => `<li style="margin-bottom:8px"><a href="${escape(l.url)}" style="color:#2652A0">${escape(describeNotification(l))}</a><br><span style="font-size:12px;color:#94A3B8">${escape(l.projectName)}</span></li>`)
    .join('');
  return {
    subject: `Ringkasan harian: ${lines.length} notifikasi belum dibaca`,
    html: layout(`Halo ${name}, ini ringkasan Anda`, `<ul style="padding-left:18px">${items}</ul>`, {
      label: 'Buka Mendunia Workbase',
      url: appUrl,
    }),
    text: `Halo ${name},\n\n${lines.map((l) => `- ${describeNotification(l)} (${l.url})`).join('\n')}`,
  };
}
