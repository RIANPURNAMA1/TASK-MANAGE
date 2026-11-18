import { z } from 'zod';
import {
  ANNOUNCEMENT_SCOPES,
  DIVISION_ROLES,
  EMAIL_DIGEST_MODES,
  ORG_ROLES,
  PRIORITIES,
  PROJECT_ROLES,
} from './enums';

/**
 * Request body/query schemas. Used for server-side validation (authoritative)
 * and client-side form validation (convenience only).
 */

// ─── primitives ───────────────────────────────────────────────────────

export const idSchema = z.string().min(1).max(64);
const email = z.string().trim().toLowerCase().email('Email tidak valid').max(254);
const password = z
  .string()
  .min(8, 'Minimal 8 karakter')
  .max(128, 'Maksimal 128 karakter');
const personName = z.string().trim().min(1, 'Wajib diisi').max(80);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus format hex #RRGGBB');
const title = z.string().trim().min(1, 'Wajib diisi').max(200);

// ─── setup & auth ─────────────────────────────────────────────────────

export const setupSchema = z.object({
  orgName: z.string().trim().min(2).max(80),
  name: personName,
  email,
  password,
});
export type SetupInput = z.infer<typeof setupSchema>;

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Wajib diisi').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const emailOnlySchema = z.object({ email });
export type EmailOnlyInput = z.infer<typeof emailOnlySchema>;

export const tokenSchema = z.object({ token: z.string().min(10).max(256) });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(256),
  password,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const acceptInvitationSchema = z.object({
  name: personName,
  password,
  /** Required only for open link invitations (no email bound to the invite). */
  email: email.optional(),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: password,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const updateMeSchema = z
  .object({
    name: personName,
    emailDigest: z.enum(EMAIL_DIGEST_MODES),
  })
  .partial();
export type UpdateMeInput = z.infer<typeof updateMeSchema>;

// ─── organization ─────────────────────────────────────────────────────

export const createDivisionSchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(500).optional(),
  color: hexColor.optional(),
});
export type CreateDivisionInput = z.infer<typeof createDivisionSchema>;

export const updateDivisionSchema = createDivisionSchema.partial();
export type UpdateDivisionInput = z.infer<typeof updateDivisionSchema>;

export const divisionMemberSchema = z.object({
  userId: idSchema,
  role: z.enum(DIVISION_ROLES).default('MEMBER'),
});
export type DivisionMemberInput = z.infer<typeof divisionMemberSchema>;

export const createProjectSchema = z.object({
  divisionId: idSchema,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).optional(),
  color: hexColor.optional(),
  isPrivate: z.boolean().default(false),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = createProjectSchema.omit({ divisionId: true }).partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const projectMemberSchema = z.object({
  userId: idSchema,
  role: z.enum(PROJECT_ROLES).default('MEMBER'),
});
export type ProjectMemberInput = z.infer<typeof projectMemberSchema>;

export const roleOnlySchema = <T extends readonly [string, ...string[]]>(roles: T) =>
  z.object({ role: z.enum(roles) });

export const muteSchema = z.object({ muted: z.boolean() });

// ─── board ────────────────────────────────────────────────────────────

/** Neighbours at the drop location; the server derives the new position from them. */
const neighbours = {
  prevId: idSchema.nullable(),
  nextId: idSchema.nullable(),
};

export const createListSchema = z.object({ name: z.string().trim().min(1).max(60) });
export type CreateListInput = z.infer<typeof createListSchema>;

export const updateListSchema = createListSchema;
export type UpdateListInput = z.infer<typeof updateListSchema>;

export const moveListSchema = z.object(neighbours);
export type MoveListInput = z.infer<typeof moveListSchema>;

export const createCardSchema = z.object({ listId: idSchema, title });
export type CreateCardInput = z.infer<typeof createCardSchema>;

export const updateCardSchema = z
  .object({
    title,
    description: z.string().max(50_000).nullable(),
    priority: z.enum(PRIORITIES),
    startDate: z.string().datetime({ offset: true }).nullable(),
    dueDate: z.string().datetime({ offset: true }).nullable(),
    completed: z.boolean(),
  })
  .partial();
export type UpdateCardInput = z.infer<typeof updateCardSchema>;

/** Calendar window (FR calendar view). Capped so one request can't pull the whole history. */
export const CALENDAR_MAX_DAYS = 100;
export const calendarQuerySchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
    /** `mine` = assigned to me, `all` = every card in projects I can see. */
    scope: z.enum(['mine', 'all']).default('mine'),
    projectId: idSchema.optional(),
  })
  .refine((q) => new Date(q.to) > new Date(q.from), { message: 'Rentang tanggal tidak valid.', path: ['to'] })
  .refine((q) => new Date(q.to).getTime() - new Date(q.from).getTime() <= CALENDAR_MAX_DAYS * 24 * 3600 * 1000, {
    message: `Rentang maksimal ${CALENDAR_MAX_DAYS} hari.`,
    path: ['to'],
  });
export type CalendarQuery = z.input<typeof calendarQuerySchema>;

export const moveCardSchema = z.object({ listId: idSchema, ...neighbours });
export type MoveCardInput = z.infer<typeof moveCardSchema>;

export const setAssigneesSchema = z.object({ userIds: z.array(idSchema).max(20) });
export type SetAssigneesInput = z.infer<typeof setAssigneesSchema>;

export const setCardLabelsSchema = z.object({ labelIds: z.array(idSchema).max(20) });
export type SetCardLabelsInput = z.infer<typeof setCardLabelsSchema>;

export const labelSchema = z.object({
  name: z.string().trim().min(1).max(30),
  color: hexColor,
});
export type LabelInput = z.infer<typeof labelSchema>;

export const createChecklistItemSchema = z.object({ title });
export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;

export const updateChecklistItemSchema = z.object({ title, isDone: z.boolean() }).partial();
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;

export const createCommentSchema = z.object({
  body: z.string().trim().min(1, 'Komentar kosong').max(10_000),
  mentionIds: z.array(idSchema).max(50).default([]),
  attachmentIds: z.array(idSchema).max(10).default([]),
});
export type CreateCommentInput = z.input<typeof createCommentSchema>;

export const updateCommentSchema = createCommentSchema.pick({ body: true, mentionIds: true });
export type UpdateCommentInput = z.input<typeof updateCommentSchema>;

// ─── chat (FR-31 – FR-34) ─────────────────────────────────────────────

export const MESSAGE_MAX_LENGTH = 4000;

export const sendMessageSchema = z.object({
  /** Client-generated id (e.g. crypto.randomUUID()) — resending the same id never duplicates. */
  clientMessageId: z.string().trim().min(8).max(64),
  body: z.string().trim().max(MESSAGE_MAX_LENGTH).default(''),
  replyToId: idSchema.nullable().default(null),
  mentionIds: z.array(idSchema).max(50).default([]),
  attachmentIds: z.array(idSchema).max(10).default([]),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const editMessageSchema = z.object({
  body: z.string().trim().min(1, 'Pesan kosong').max(MESSAGE_MAX_LENGTH),
  mentionIds: z.array(idSchema).max(50).default([]),
});
export type EditMessageInput = z.input<typeof editMessageSchema>;

export const reactionSchema = z.object({
  /** A single emoji (may span several code points, e.g. 👍🏽). */
  emoji: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .regex(/^[^\s\w]+$/u, 'Reaksi harus berupa emoji'),
});
export type ReactionInput = z.infer<typeof reactionSchema>;

export const openDirectSchema = z.object({ userId: idSchema });

export const messagesQuerySchema = z.object({
  /** Load messages older than this message id. */
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ─── files ────────────────────────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // FR-27

export const presignUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(127),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES, 'Ukuran file maksimal 100 MB'),
  cardId: idSchema.optional(),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

/** Profile photos are resized in the browser first, so 2 MB is generous. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_CONTENT_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;

export const avatarUploadSchema = z.object({
  contentType: z.enum(AVATAR_CONTENT_TYPES),
  size: z.number().int().positive().max(AVATAR_MAX_BYTES, 'Ukuran foto maksimal 2 MB'),
});
export type AvatarUploadInput = z.infer<typeof avatarUploadSchema>;

/** Server-generated avatar file name: 32 hex chars + extension. */
export const AVATAR_FILE_PATTERN = /^[a-f0-9]{32}\.(webp|jpg|png)$/;
export const completeAvatarSchema = z.object({ file: z.string().regex(AVATAR_FILE_PATTERN) });
export type CompleteAvatarInput = z.infer<typeof completeAvatarSchema>;

// ─── admin ────────────────────────────────────────────────────────────

export const updateOrgRoleSchema = z.object({ role: z.enum(ORG_ROLES) });
export type UpdateOrgRoleInput = z.infer<typeof updateOrgRoleSchema>;

export const deactivateUserSchema = z.object({
  /** Cards assigned to the deactivated user move to this user (FR-48). */
  transferToUserId: idSchema.nullable().default(null),
});
export type DeactivateUserInput = z.input<typeof deactivateUserSchema>;

export const createInvitationSchema = z.object({
  /** Omit for a shareable link invitation. */
  email: email.optional(),
  role: z.enum(ORG_ROLES).default('MEMBER'),
  divisionId: idSchema.optional(),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});
export type CreateInvitationInput = z.input<typeof createInvitationSchema>;

/** Admin menambahkan pengguna langsung (tanpa undangan/verifikasi email). */
export const createUserSchema = z.object({
  name: personName,
  email,
  password,
  role: z.enum(ORG_ROLES).default('MEMBER'),
  divisionId: idSchema.optional(),
});
export type CreateUserInput = z.input<typeof createUserSchema>;

// ─── queries ──────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const notificationQuerySchema = paginationSchema.extend({
  unreadOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});

// ─── dashboard ────────────────────────────────────────────────────────

/** `tz` is the viewer's IANA time zone so "today" and daily buckets match their calendar. */
export const dashboardQuerySchema = z.object({
  tz: z.string().trim().max(64).optional(),
});
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

// ─── announcements ────────────────────────────────────────────────────

export const createAnnouncementSchema = z
  .object({
    scope: z.enum(ANNOUNCEMENT_SCOPES),
    divisionId: idSchema.optional(),
    projectId: idSchema.optional(),
    title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(200, 'Judul maksimal 200 karakter'),
    body: z.string().max(50_000, 'Isi pengumuman terlalu panjang'),
    pinned: z.boolean().default(false),
  })
  .refine((v) => v.scope !== 'DIVISION' || v.divisionId, { message: 'Pilih divisi tujuan', path: ['divisionId'] })
  .refine((v) => v.scope !== 'PROJECT' || v.projectId, { message: 'Pilih proyek tujuan', path: ['projectId'] });
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

export const updateAnnouncementSchema = z
  .object({
    title: z.string().trim().min(3, 'Judul minimal 3 karakter').max(200, 'Judul maksimal 200 karakter'),
    body: z.string().max(50_000, 'Isi pengumuman terlalu panjang'),
  })
  .partial();
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

export const announcementListQuerySchema = z.object({
  scope: z.enum(ANNOUNCEMENT_SCOPES).optional(),
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  q: z.string().trim().max(100).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AnnouncementListQuery = z.infer<typeof announcementListQuerySchema>;

export const pinAnnouncementSchema = z.object({ pinned: z.boolean() });

export const announcementCommentSchema = z.object({
  body: z.string().trim().min(1, 'Komentar tidak boleh kosong').max(4000, 'Komentar maksimal 4000 karakter'),
});
export type AnnouncementCommentInput = z.infer<typeof announcementCommentSchema>;

// ─── desktop auth (PRD §4) ────────────────────────────────────────────

/** Desktop sends its refresh token in the body (no cookies in the webview). */
export const refreshTokenBodySchema = z.object({ refreshToken: z.string().min(1).max(512).optional() }).default({});

/** Query of `/auth/google/start` when opened by the desktop app in the system browser. */
export const googleStartQuerySchema = z.object({
  client: z.enum(['web', 'desktop']).default('web'),
  /** base64url(SHA-256(verifier)) generated by the desktop app (PKCE S256). */
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  state: z.string().regex(/^[A-Za-z0-9_-]{16,128}$/).optional(),
});

export const desktopExchangeSchema = z.object({
  code: z.string().min(16).max(128),
  verifier: z.string().regex(/^[A-Za-z0-9_-]{43,128}$/),
});
export type DesktopExchangeInput = z.infer<typeof desktopExchangeSchema>;
