import type {
  AnnouncementScope,
  ChannelType,
  DeviceType,
  DivisionRole,
  EmailDigestMode,
  NotificationType,
  OrgRole,
  Priority,
  ProjectRole,
} from './enums';

/**
 * Response shapes of the REST API (v1). Dates are ISO-8601 strings on the wire.
 * Changing a field here is an API contract change: keep it backward compatible
 * because desktop clients may lag several versions behind (PRD §4).
 */

export type ISODate = string;

// ─── identity ─────────────────────────────────────────────────────────

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Me extends UserSummary {
  orgRole: OrgRole;
  emailDigest: EmailDigestMode;
  hasPassword: boolean;
  organization: { id: string; name: string };
}

export interface AuthResponse {
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  user: Me;
  /**
   * Desktop clients only (`x-desktop-device` header): the rotating refresh token, kept in
   * the OS keychain. Web clients get it as an httpOnly cookie instead and never see it.
   */
  refreshToken?: string;
}

export interface SessionDTO {
  id: string;
  deviceType: DeviceType;
  deviceName: string;
  ipAddress: string | null;
  lastUsedAt: ISODate;
  createdAt: ISODate;
  isCurrent: boolean;
}

export interface AppMeta {
  minDesktopVersion: string;
  googleEnabled: boolean;
  setupRequired: boolean;
}

export interface InvitationPreview {
  organizationName: string;
  email: string | null;
  role: OrgRole;
  divisionName: string | null;
  expiresAt: ISODate;
}

export interface AcceptInvitationResult {
  /** True when the account must verify its email before it can log in. */
  requiresVerification: boolean;
  auth: AuthResponse | null;
}

// ─── organization ─────────────────────────────────────────────────────

export interface DivisionDTO {
  id: string;
  name: string;
  description: string | null;
  color: string;
  memberCount: number;
  projectCount: number;
  myRole: DivisionRole | null;
  canManage: boolean;
}

export interface DivisionMemberDTO {
  user: UserSummary;
  role: DivisionRole;
  orgRole: OrgRole;
}

export interface ProjectAccess {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
}

export interface ProjectDTO {
  id: string;
  divisionId: string;
  divisionName: string;
  name: string;
  description: string | null;
  color: string;
  isPrivate: boolean;
  archivedAt: ISODate | null;
  memberCount: number;
  openCardCount: number;
  myRole: ProjectRole | null;
  isMuted: boolean;
  access: ProjectAccess;
}

export interface ProjectMemberDTO {
  user: UserSummary;
  role: ProjectRole;
}

// ─── board ────────────────────────────────────────────────────────────

export interface LabelDTO {
  id: string;
  name: string;
  color: string;
}

export interface ListDTO {
  id: string;
  projectId: string;
  name: string;
  position: string;
  archivedAt: ISODate | null;
}

export interface CardSummary {
  id: string;
  projectId: string;
  listId: string;
  title: string;
  priority: Priority;
  dueDate: ISODate | null;
  position: string;
  completedAt: ISODate | null;
  archivedAt: ISODate | null;
  assignees: UserSummary[];
  labels: LabelDTO[];
  checklist: { done: number; total: number };
  /** First few checklist items, for showing subtasks on the board tile. */
  checklistPreview: { id: string; title: string; isDone: boolean }[];
  /** Plain-text start of the description (≤ 160 chars), or null. */
  excerpt: string | null;
  commentCount: number;
  attachmentCount: number;
  updatedAt: ISODate;
}

export interface BoardData {
  project: ProjectDTO;
  lists: ListDTO[];
  cards: CardSummary[];
  labels: LabelDTO[];
  members: UserSummary[];
}

export interface ArchivedItems {
  lists: ListDTO[];
  cards: CardSummary[];
}

export interface ChecklistItemDTO {
  id: string;
  title: string;
  isDone: boolean;
  position: string;
}

export interface AttachmentDTO {
  id: string;
  projectId: string;
  cardId: string | null;
  commentId: string | null;
  messageId: string | null;
  fileName: string;
  mimeType: string;
  size: number;
  uploader: UserSummary;
  createdAt: ISODate;
  /** Images and PDFs can be previewed inline (FR-28). */
  previewable: boolean;
}

export interface CommentDTO {
  id: string;
  cardId: string;
  author: UserSummary;
  body: string;
  mentions: UserSummary[];
  attachments: AttachmentDTO[];
  editedAt: ISODate | null;
  createdAt: ISODate;
}

export interface CardDetail extends CardSummary {
  description: string | null;
  createdBy: UserSummary;
  createdAt: ISODate;
  list: { id: string; name: string };
  project: { id: string; name: string; color: string };
  checklistItems: ChecklistItemDTO[];
  attachments: AttachmentDTO[];
  access: ProjectAccess;
}

export interface MyTaskDTO extends CardSummary {
  project: { id: string; name: string; color: string; divisionName: string };
  list: { id: string; name: string };
}

export interface ActivityDTO {
  id: string;
  actor: UserSummary;
  entityType: string;
  entityId: string;
  cardId: string | null;
  action: string;
  diff: Record<string, unknown>;
  createdAt: ISODate;
}

export interface PresignUploadResponse {
  attachment: AttachmentDTO;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

export interface AvatarUploadResponse {
  /** Pass back to `POST /me/avatar/complete` once the bytes are uploaded. */
  file: string;
  upload: { url: string; method: 'PUT'; headers: Record<string, string> };
}

export interface SignedUrlResponse {
  url: string;
  expiresAt: ISODate;
}

// ─── chat ─────────────────────────────────────────────────────────────

export interface ChannelDTO {
  id: string;
  type: ChannelType;
  /** Project name, or the other person's name for direct messages. */
  name: string;
  project: { id: string; name: string; color: string } | null;
  /** The other participant of a direct channel. */
  peer: UserSummary | null;
  unreadCount: number;
  lastMessage: { id: string; authorName: string; body: string; createdAt: ISODate } | null;
  lastMessageAt: ISODate | null;
  /** False for read-only access (project viewer, or DM with a deactivated user). */
  canPost: boolean;
}

export interface ChannelMemberDTO {
  user: UserSummary;
  lastReadAt: ISODate | null;
}

export interface ChannelDetail extends ChannelDTO {
  /** Participants that can be @mentioned, with their read position (FR-33). */
  members: ChannelMemberDTO[];
}

export interface ReactionDTO {
  emoji: string;
  count: number;
  userIds: string[];
}

export interface MessageDTO {
  id: string;
  channelId: string;
  clientMessageId: string;
  author: UserSummary;
  /** Empty when deleted. */
  body: string;
  replyTo: { id: string; authorName: string; body: string; deleted: boolean } | null;
  mentions: UserSummary[];
  reactions: ReactionDTO[];
  attachments: AttachmentDTO[];
  editedAt: ISODate | null;
  deletedAt: ISODate | null;
  createdAt: ISODate;
}

export interface MessagePage {
  /** Oldest first. */
  items: MessageDTO[];
  /** Pass as `before` to load older messages; null when the beginning is reached. */
  nextCursor: string | null;
}

// ─── notifications ────────────────────────────────────────────────────

export interface NotificationDTO {
  id: string;
  type: NotificationType;
  actor: UserSummary | null;
  projectId: string | null;
  cardId: string | null;
  data: {
    cardTitle?: string;
    projectName?: string;
    excerpt?: string;
    /** CHAT_MENTION only. */
    channelId?: string;
    channelName?: string;
    /** ANNOUNCEMENT only: a new announcement, or a comment on one the user wrote. */
    announcementId?: string;
    announcementTitle?: string;
    announcementKind?: 'posted' | 'comment';
    /** e.g. "Perusahaan", "Divisi Engineering", "Proyek NexusTask v1". */
    scopeLabel?: string;
  };
  readAt: ISODate | null;
  createdAt: ISODate;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NotificationPage extends Paginated<NotificationDTO> {
  unreadCount: number;
}

// ─── admin ────────────────────────────────────────────────────────────

export interface AdminUserDTO extends UserSummary {
  orgRole: OrgRole;
  emailVerified: boolean;
  deactivatedAt: ISODate | null;
  activeSessionCount: number;
  openTaskCount: number;
  createdAt: ISODate;
}

export interface InvitationDTO {
  id: string;
  email: string | null;
  role: OrgRole;
  divisionName: string | null;
  invitedBy: UserSummary;
  expiresAt: ISODate;
  acceptedAt: ISODate | null;
  revokedAt: ISODate | null;
  createdAt: ISODate;
}

export interface CreateInvitationResponse {
  invitation: InvitationDTO;
  /** Full acceptance link. Shown once; only its hash is stored. */
  link: string;
}

// ─── dashboard (FR-43, FR-44) ─────────────────────────────────────────

/**
 * What the dashboard aggregates over, decided on the server from the caller's role:
 * organization (Owner/Admin), division (division leads: the divisions they lead),
 * personal (members & guests: the projects they belong to).
 */
export type DashboardScope = 'organization' | 'division' | 'personal';

export interface DashboardStats {
  open: number;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
  /** Open cards nobody is assigned to. */
  unassigned: number;
  completedThisWeek: number;
  completedLastWeek: number;
  createdThisWeek: number;
}

export interface DashboardTrendPoint {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  created: number;
  completed: number;
}

export interface DashboardProjectRow {
  id: string;
  name: string;
  color: string;
  divisionName: string;
  open: number;
  overdue: number;
  completedThisWeek: number;
  /** All completed (non-archived) cards, for the progress bar. */
  completedTotal: number;
  memberCount: number;
}

export interface DashboardDivisionRow {
  id: string;
  name: string;
  color: string;
  projectCount: number;
  memberCount: number;
  open: number;
  overdue: number;
  completedThisWeek: number;
}

export interface DashboardWorkloadRow {
  user: UserSummary;
  open: number;
  overdue: number;
  dueThisWeek: number;
  urgent: number;
  completedThisWeek: number;
}

export interface DashboardActivityItem extends ActivityDTO {
  cardTitle: string | null;
  project: { id: string; name: string; color: string };
}

export interface DashboardOrgHealth {
  activeUsers: number;
  deactivatedUsers: number;
  unverifiedUsers: number;
  guests: number;
  pendingInvitations: number;
  activeSessions: number;
  divisions: number;
}

export interface DashboardDTO {
  scope: DashboardScope;
  /** e.g. "Seluruh organisasi", "Divisi Engineering", "3 proyek Anda". */
  scopeLabel: string;
  generatedAt: ISODate;
  /** The caller's own assigned cards, regardless of scope. */
  personal: { stats: DashboardStats; upcoming: MyTaskDTO[] };
  team: {
    stats: DashboardStats;
    trend: DashboardTrendPoint[];
    priorities: { priority: Priority; count: number }[];
    projects: DashboardProjectRow[];
    activity: DashboardActivityItem[];
    /** Division leads and admins only. */
    workload: DashboardWorkloadRow[] | null;
    /** Admins only. */
    divisions: DashboardDivisionRow[] | null;
  };
  /** Admins only. */
  org: DashboardOrgHealth | null;
}

// ─── announcements (FR-35, FR-36) ─────────────────────────────────────

export interface AnnouncementTargetRef {
  id: string;
  name: string;
  color: string;
}

export interface AnnouncementSummary {
  id: string;
  scope: AnnouncementScope;
  division: AnnouncementTargetRef | null;
  project: (AnnouncementTargetRef & { divisionName: string }) | null;
  author: UserSummary;
  title: string;
  /** Plain-text start of the body (≤ 240 chars). */
  excerpt: string;
  pinnedAt: ISODate | null;
  editedAt: ISODate | null;
  createdAt: ISODate;
  commentCount: number;
  isRead: boolean;
  /** Caller may pin, edit and delete. */
  canManage: boolean;
}

export interface AnnouncementDetail extends AnnouncementSummary {
  /** Sanitized HTML. */
  body: string;
  pinnedBy: UserSummary | null;
  /** Readers among the intended audience, and the audience size. */
  readCount: number;
  audienceCount: number;
  /** First readers (managers only; empty otherwise). */
  readers: UserSummary[];
}

export interface AnnouncementCommentDTO {
  id: string;
  author: UserSummary;
  body: string;
  editedAt: ISODate | null;
  deletedAt: ISODate | null;
  createdAt: ISODate;
}

export interface AnnouncementPage extends Paginated<AnnouncementSummary> {
  /** Pinned announcements matching the filter (first page only, always on top). */
  pinned: AnnouncementSummary[];
  unreadCount: number;
}

/** Where the caller may post. */
export interface AnnouncementTargets {
  organization: boolean;
  divisions: AnnouncementTargetRef[];
  projects: (AnnouncementTargetRef & { divisionName: string })[];
}
