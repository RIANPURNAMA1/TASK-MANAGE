/**
 * Enum values mirrored from the Prisma schema. Kept here (not imported from @prisma/client)
 * so the browser bundle never depends on the database client.
 */

export const ORG_ROLES = ['OWNER', 'ADMIN', 'DIVISION_LEAD', 'MEMBER', 'GUEST'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const DIVISION_ROLES = ['LEAD', 'MEMBER'] as const;
export type DivisionRole = (typeof DIVISION_ROLES)[number];

export const PROJECT_ROLES = ['ADMIN', 'MEMBER'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const EMAIL_DIGEST_MODES = ['INSTANT', 'DAILY', 'OFF'] as const;
export type EmailDigestMode = (typeof EMAIL_DIGEST_MODES)[number];

export const NOTIFICATION_TYPES = [
  'CARD_ASSIGNED',
  'MENTIONED',
  'COMMENT_ADDED',
  'DUE_SOON',
  'OVERDUE',
  'CHAT_MENTION',
  'ANNOUNCEMENT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const ANNOUNCEMENT_SCOPES = ['ORGANIZATION', 'DIVISION', 'PROJECT'] as const;
export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

export const ANNOUNCEMENT_SCOPE_LABEL: Record<AnnouncementScope, string> = {
  ORGANIZATION: 'Perusahaan',
  DIVISION: 'Divisi',
  PROJECT: 'Proyek',
};

export const CHANNEL_TYPES = ['PROJECT', 'DIRECT'] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const DEVICE_TYPES = ['WEB', 'DESKTOP'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

/** Indonesian UI labels, shared so emails and the web app say the same thing. */
export const ORG_ROLE_LABEL: Record<OrgRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  DIVISION_LEAD: 'Division Lead',
  MEMBER: 'Member',
  GUEST: 'Guest',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  NONE: 'Tanpa prioritas',
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
};

export const EMAIL_DIGEST_LABEL: Record<EmailDigestMode, string> = {
  INSTANT: 'Langsung',
  DAILY: 'Ringkasan harian',
  OFF: 'Nonaktif',
};
