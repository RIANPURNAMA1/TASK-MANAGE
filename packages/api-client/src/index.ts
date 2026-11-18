import type {
  AcceptInvitationInput,
  AgentApprovalDTO,
  AgentConversationDTO,
  AgentMemoryDTO,
  AgentMessageDTO,
  AgentProviderName,
  AgentProviderSettingDTO,
  AgentRunDTO,
  AgentScheduleDTO,
  AgentSkillDTO,
  AgentStatusDTO,
  AgentStepDTO,
  AgentUsageDTO,
  ConfirmScheduleInput,
  CreateMemoryInput,
  CardAgentRunDTO,
  CreateTeamAgentInput,
  PersonalAgentDTO,
  RunTeamAgentInput,
  TeamAgentDTO,
  UpdateTeamAgentInput,
  SaveSkillInput,
  SchedulePreviewDTO,
  SendAgentMessageInput,
  UpdatePersonalAgentInput,
  UpsertAgentProviderInput,
  KnowledgeDocDTO,
  AcceptInvitationResult,
  ActivityDTO,
  AdminUserDTO,
  AppMeta,
  ArchivedItems,
  AnnouncementCommentDTO,
  AnnouncementCommentInput,
  AnnouncementDetail,
  AnnouncementListQuery,
  AnnouncementPage,
  AnnouncementTargets,
  AttachmentDTO,
  AvatarUploadInput,
  CalendarQuery,
  AvatarUploadResponse,
  AuthResponse,
  BoardData,
  CardDetail,
  CardSummary,
  ChangePasswordInput,
  CreateAnnouncementInput,
  DesktopExchangeInput,
  DashboardDTO,
  ChannelDetail,
  ChannelDTO,
  ChecklistItemDTO,
  CommentDTO,
  CreateCardInput,
  CreateChecklistItemInput,
  CreateCommentInput,
  CreateDivisionInput,
  CreateInvitationInput,
  CreateUserInput,
  CreateInvitationResponse,
  CreateListInput,
  CreateProjectInput,
  DeactivateUserInput,
  DivisionDTO,
  DivisionMemberInput,
  DivisionMemberDTO,
  DivisionRole,
  EditMessageInput,
  InvitationDTO,
  InvitationPreview,
  LabelDTO,
  LabelInput,
  ListDTO,
  LoginInput,
  Me,
  MessageDTO,
  MessagePage,
  MoveCardInput,
  MoveListInput,
  MyTaskDTO,
  NotificationPage,
  OrgRole,
  Paginated,
  PresignUploadInput,
  PresignUploadResponse,
  ProjectDTO,
  ProjectMemberDTO,
  ProjectMemberInput,
  ProjectRole,
  SendMessageInput,
  SessionDTO,
  SetupInput,
  SignedUrlResponse,
  UpdateCardInput,
  UpdateChecklistItemInput,
  UpdateCommentInput,
  UpdateAnnouncementInput,
  UpdateDivisionInput,
  UpdateMeInput,
  UpdateProjectInput,
  UserSummary,
} from '@nexus/shared';
import { HttpClient, type HttpClientOptions } from './http';

export { ApiError, HttpClient, type HttpClientOptions, type RefreshTokenStore } from './http';

/**
 * Typed SDK for the Mendunia Workbase REST API (v1). One method per endpoint, grouped by resource.
 * UI code depends on this — never on raw URLs.
 */
export function createApiClient(options: HttpClientOptions) {
  const http = new HttpClient(options);

  return {
    http,

    meta: () => http.get<AppMeta>('/meta'),
    setup: (input: SetupInput) => http.post<AuthResponse>('/setup', input, { anonymous: true }),

    auth: {
      login: (input: LoginInput) => http.post<AuthResponse>('/auth/login', input, { anonymous: true }),
      refresh: () => http.refresh(),
      logout: () => http.logout(),
      /** Desktop Google SSO: redeem the one-time code from `taskapp://auth/callback`. */
      googleDesktopExchange: (input: DesktopExchangeInput) =>
        http.post<AuthResponse>('/auth/google/desktop-exchange', input, { anonymous: true }),
      verifyEmail: (token: string) =>
        http.post<void>('/auth/verify-email', { token }, { anonymous: true }),
      resendVerification: (email: string) =>
        http.post<void>('/auth/resend-verification', { email }, { anonymous: true }),
      forgotPassword: (email: string) =>
        http.post<void>('/auth/forgot-password', { email }, { anonymous: true }),
      resetPassword: (token: string, password: string) =>
        http.post<void>('/auth/reset-password', { token, password }, { anonymous: true }),
      googleStartUrl: (desktop?: { challenge: string; state: string }) =>
        `${options.baseUrl}/auth/google/start${desktop ? `?${new URLSearchParams({ client: 'desktop', ...desktop }).toString()}` : ''}`,
      sessions: () => http.get<SessionDTO[]>('/auth/sessions'),
      revokeSession: (id: string) => http.delete(`/auth/sessions/${id}`),
      revokeOtherSessions: () => http.delete('/auth/sessions'),
    },

    invitations: {
      preview: (token: string) =>
        http.request<InvitationPreview>('GET', `/invitations/${token}`, { anonymous: true }),
      accept: (token: string, input: AcceptInvitationInput) =>
        http.post<AcceptInvitationResult>(`/invitations/${token}/accept`, input, { anonymous: true }),
    },

    announcements: {
      list: (query: Partial<Omit<AnnouncementListQuery, 'unread'>> & { unread?: boolean }) =>
        http.get<AnnouncementPage>('/announcements', {
          scope: query.scope,
          q: query.q || undefined,
          cursor: query.cursor,
          limit: query.limit,
          unread: query.unread ? 'true' : undefined,
        }),
      unreadCount: () => http.get<{ count: number }>('/announcements/unread-count'),
      targets: () => http.get<AnnouncementTargets>('/announcements/targets'),
      get: (id: string) => http.get<AnnouncementDetail>(`/announcements/${id}`),
      create: (input: CreateAnnouncementInput) => http.post<AnnouncementDetail>('/announcements', input),
      update: (id: string, input: UpdateAnnouncementInput) => http.patch<AnnouncementDetail>(`/announcements/${id}`, input),
      remove: (id: string) => http.delete(`/announcements/${id}`),
      pin: (id: string, pinned: boolean) => http.post<AnnouncementDetail>(`/announcements/${id}/pin`, { pinned }),
      markRead: (id: string) => http.post<void>(`/announcements/${id}/read`),
      markAllRead: () => http.post<void>('/announcements/read-all'),
      comments: (id: string) => http.get<AnnouncementCommentDTO[]>(`/announcements/${id}/comments`),
      addComment: (id: string, input: AnnouncementCommentInput) =>
        http.post<AnnouncementCommentDTO>(`/announcements/${id}/comments`, input),
      editComment: (commentId: string, input: AnnouncementCommentInput) =>
        http.patch<AnnouncementCommentDTO>(`/announcement-comments/${commentId}`, input),
      removeComment: (commentId: string) => http.delete(`/announcement-comments/${commentId}`),
    },

    dashboard: {
      get: (tz?: string) => http.get<DashboardDTO>('/dashboard', { tz }),
    },

    me: {
      get: () => http.get<Me>('/me'),
      update: (input: UpdateMeInput) => http.patch<Me>('/me', input),
      changePassword: (input: ChangePasswordInput) => http.post<void>('/me/password', input),
      tasks: () => http.get<MyTaskDTO[]>('/me/tasks'),
      calendar: (query: CalendarQuery) => http.get<MyTaskDTO[]>('/me/calendar', { ...query }),
      presignAvatar: (input: AvatarUploadInput) => http.post<AvatarUploadResponse>('/me/avatar', input),
      completeAvatar: (file: string) => http.post<Me>('/me/avatar/complete', { file }),
      removeAvatar: () => http.delete<Me>('/me/avatar'),
    },

    users: {
      search: (q?: string) => http.get<UserSummary[]>('/users', { q }),
    },

    divisions: {
      list: () => http.get<DivisionDTO[]>('/divisions'),
      create: (input: CreateDivisionInput) => http.post<DivisionDTO>('/divisions', input),
      update: (id: string, input: UpdateDivisionInput) =>
        http.patch<DivisionDTO>(`/divisions/${id}`, input),
      archive: (id: string) => http.delete(`/divisions/${id}`),
      members: (id: string) => http.get<DivisionMemberDTO[]>(`/divisions/${id}/members`),
      addMember: (id: string, input: DivisionMemberInput) =>
        http.post<DivisionMemberDTO>(`/divisions/${id}/members`, input),
      updateMember: (id: string, userId: string, role: DivisionRole) =>
        http.patch<DivisionMemberDTO>(`/divisions/${id}/members/${userId}`, { role }),
      removeMember: (id: string, userId: string) =>
        http.delete(`/divisions/${id}/members/${userId}`),
    },

    projects: {
      list: (query: { divisionId?: string; archived?: boolean } = {}) =>
        http.get<ProjectDTO[]>('/projects', query),
      get: (id: string) => http.get<ProjectDTO>(`/projects/${id}`),
      create: (input: CreateProjectInput) => http.post<ProjectDTO>('/projects', input),
      update: (id: string, input: UpdateProjectInput) =>
        http.patch<ProjectDTO>(`/projects/${id}`, input),
      archive: (id: string) => http.post<ProjectDTO>(`/projects/${id}/archive`),
      restore: (id: string) => http.post<ProjectDTO>(`/projects/${id}/restore`),
      join: (id: string) => http.post<ProjectDTO>(`/projects/${id}/join`),
      setMuted: (id: string, muted: boolean) =>
        http.put<ProjectDTO>(`/projects/${id}/mute`, { muted }),
      members: (id: string) => http.get<ProjectMemberDTO[]>(`/projects/${id}/members`),
      addMember: (id: string, input: ProjectMemberInput) =>
        http.post<ProjectMemberDTO>(`/projects/${id}/members`, input),
      updateMember: (id: string, userId: string, role: ProjectRole) =>
        http.patch<ProjectMemberDTO>(`/projects/${id}/members/${userId}`, { role }),
      removeMember: (id: string, userId: string) => http.delete(`/projects/${id}/members/${userId}`),
      activity: (id: string, cursor?: string) =>
        http.get<Paginated<ActivityDTO>>(`/projects/${id}/activity`, { cursor }),
      board: (id: string) => http.get<BoardData>(`/projects/${id}/board`),
      archived: (id: string) => http.get<ArchivedItems>(`/projects/${id}/archived`),
      attachments: (id: string) => http.get<AttachmentDTO[]>(`/projects/${id}/attachments`),
    },

    lists: {
      create: (projectId: string, input: CreateListInput) =>
        http.post<ListDTO>(`/projects/${projectId}/lists`, input),
      rename: (id: string, name: string) => http.patch<ListDTO>(`/lists/${id}`, { name }),
      move: (id: string, input: MoveListInput) => http.post<ListDTO>(`/lists/${id}/move`, input),
      archive: (id: string) => http.post<ListDTO>(`/lists/${id}/archive`),
      restore: (id: string) => http.post<ListDTO>(`/lists/${id}/restore`),
    },

    labels: {
      create: (projectId: string, input: LabelInput) =>
        http.post<LabelDTO>(`/projects/${projectId}/labels`, input),
      update: (id: string, input: Partial<LabelInput>) => http.patch<LabelDTO>(`/labels/${id}`, input),
      remove: (id: string) => http.delete(`/labels/${id}`),
    },

    cards: {
      create: (projectId: string, input: CreateCardInput) =>
        http.post<CardSummary>(`/projects/${projectId}/cards`, input),
      get: (id: string) => http.get<CardDetail>(`/cards/${id}`),
      update: (id: string, input: UpdateCardInput) => http.patch<CardSummary>(`/cards/${id}`, input),
      move: (id: string, input: MoveCardInput) => http.post<CardSummary>(`/cards/${id}/move`, input),
      setAssignees: (id: string, userIds: string[]) =>
        http.put<CardSummary>(`/cards/${id}/assignees`, { userIds }),
      setLabels: (id: string, labelIds: string[]) =>
        http.put<CardSummary>(`/cards/${id}/labels`, { labelIds }),
      archive: (id: string) => http.post<CardSummary>(`/cards/${id}/archive`),
      restore: (id: string) => http.post<CardSummary>(`/cards/${id}/restore`),
      activity: (id: string) => http.get<ActivityDTO[]>(`/cards/${id}/activity`),
    },

    checklist: {
      create: (cardId: string, input: CreateChecklistItemInput) =>
        http.post<ChecklistItemDTO>(`/cards/${cardId}/checklist`, input),
      update: (id: string, input: UpdateChecklistItemInput) =>
        http.patch<ChecklistItemDTO>(`/checklist/${id}`, input),
      remove: (id: string) => http.delete(`/checklist/${id}`),
    },

    comments: {
      list: (cardId: string) => http.get<CommentDTO[]>(`/cards/${cardId}/comments`),
      create: (cardId: string, input: CreateCommentInput) =>
        http.post<CommentDTO>(`/cards/${cardId}/comments`, input),
      update: (id: string, input: UpdateCommentInput) =>
        http.patch<CommentDTO>(`/comments/${id}`, input),
      remove: (id: string) => http.delete(`/comments/${id}`),
    },

    attachments: {
      presign: (projectId: string, input: PresignUploadInput) =>
        http.post<PresignUploadResponse>(`/projects/${projectId}/attachments`, input),
      complete: (id: string) => http.post<AttachmentDTO>(`/attachments/${id}/complete`),
      signedUrl: (id: string, disposition: 'inline' | 'attachment' = 'attachment') =>
        http.get<SignedUrlResponse>(`/attachments/${id}/url`, { disposition }),
      remove: (id: string) => http.delete(`/attachments/${id}`),
    },

    chat: {
      channels: () => http.get<ChannelDTO[]>('/chat/channels'),
      channel: (id: string) => http.get<ChannelDetail>(`/chat/channels/${id}`),
      /** Gets or creates the 1-on-1 channel with `userId` (FR-32). */
      openDirect: (userId: string) => http.post<ChannelDTO>('/chat/direct', { userId }),
      /** Channel of a project (for a "Chat" button on the project page). */
      projectChannel: (projectId: string) => http.get<ChannelDTO>(`/chat/projects/${projectId}/channel`),
      messages: (channelId: string, query: { before?: string; limit?: number } = {}) =>
        http.get<MessagePage>(`/chat/channels/${channelId}/messages`, query),
      send: (channelId: string, input: SendMessageInput) =>
        http.post<MessageDTO>(`/chat/channels/${channelId}/messages`, input),
      edit: (messageId: string, input: EditMessageInput) =>
        http.patch<MessageDTO>(`/chat/messages/${messageId}`, input),
      remove: (messageId: string) => http.delete<MessageDTO>(`/chat/messages/${messageId}`),
      /** Toggles the caller's reaction. */
      react: (messageId: string, emoji: string) =>
        http.post<MessageDTO>(`/chat/messages/${messageId}/reactions`, { emoji }),
      markRead: (channelId: string) => http.post<void>(`/chat/channels/${channelId}/read`),
      /** User ids currently online in the organization (FR-33). */
      presence: () => http.get<string[]>('/chat/presence'),
    },

    notifications: {
      list: (query: { cursor?: string; unreadOnly?: boolean } = {}) =>
        http.get<NotificationPage>('/notifications', query),
      markRead: (id: string) => http.post<void>(`/notifications/${id}/read`),
      markAllRead: () => http.post<void>('/notifications/read-all'),
    },

    agents: {
      status: () => http.get<AgentStatusDTO>('/agents/status'),
      updatePersonal: (input: UpdatePersonalAgentInput) => http.patch<PersonalAgentDTO>('/agents/personal', input),
      providerSettings: () => http.get<AgentProviderSettingDTO[]>('/agents/providers'),
      saveProviderSetting: (provider: AgentProviderName, input: UpsertAgentProviderInput) =>
        http.put<AgentProviderSettingDTO>(`/agents/providers/${provider}`, input),
      deleteProviderSetting: (provider: AgentProviderName) => http.delete(`/agents/providers/${provider}`),
      conversations: (q?: string) => http.get<AgentConversationDTO[]>('/agents/conversations', { q: q || undefined }),
      messages: (conversationId: string) => http.get<AgentMessageDTO[]>(`/agents/conversations/${conversationId}/messages`),
      deleteConversation: (id: string) => http.delete(`/agents/conversations/${id}`),
      send: (input: SendAgentMessageInput) =>
        http.post<{ conversationId: string; message: AgentMessageDTO; runId: string }>('/agents/messages', input),
      approvals: (ids?: string[]) => http.get<AgentApprovalDTO[]>('/agents/approvals', { ids: ids?.join(',') }),
      decide: (id: string, approve: boolean) => http.post<AgentApprovalDTO>(`/agents/approvals/${id}/${approve ? 'approve' : 'reject'}`),
      run: (id: string) => http.get<{ run: AgentRunDTO; steps: AgentStepDTO[] }>(`/agents/runs/${id}`),
      cancelRun: (id: string) => http.post<{ ok: true }>(`/agents/runs/${id}/cancel`),
      reflect: (id: string) => http.post<{ skill: AgentSkillDTO | null }>(`/agents/runs/${id}/reflect`),
      cancelAll: () => http.post<{ cancelled: number }>('/agents/admin/cancel-all'),
      memories: () => http.get<AgentMemoryDTO[]>('/agents/memories'),
      createMemory: (input: CreateMemoryInput) => http.post<AgentMemoryDTO>('/agents/memories', input),
      updateMemory: (id: string, content: string) => http.patch<AgentMemoryDTO>(`/agents/memories/${id}`, { content }),
      approveMemory: (id: string, approve: boolean) => http.post<AgentMemoryDTO>(`/agents/memories/${id}/${approve ? 'approve' : 'reject'}`),
      deleteMemory: (id: string) => http.delete(`/agents/memories/${id}`),
      knowledge: () => http.get<KnowledgeDocDTO[]>('/agents/knowledge'),
      addKnowledge: (input: { title: string; content: string; scope: 'USER' | 'PROJECT' | 'DIVISION' | 'ORG'; scopeId?: string }) =>
        http.post<KnowledgeDocDTO>('/agents/knowledge', input),
      deleteKnowledge: (id: string) => http.delete(`/agents/knowledge/${id}`),
      schedules: () => http.get<AgentScheduleDTO[]>('/agents/schedules'),
      previewSchedule: (text: string) => http.post<SchedulePreviewDTO>('/agents/schedules/preview', { text }),
      confirmSchedule: (input: ConfirmScheduleInput) => http.post<AgentScheduleDTO>('/agents/schedules', input),
      setScheduleActive: (id: string, isActive: boolean) => http.patch<AgentScheduleDTO>(`/agents/schedules/${id}`, { isActive }),
      deleteSchedule: (id: string) => http.delete(`/agents/schedules/${id}`),
      skills: () => http.get<AgentSkillDTO[]>('/agents/skills'),
      createSkill: (input: SaveSkillInput) => http.post<AgentSkillDTO>('/agents/skills', input),
      reviewSkill: (id: string, action: 'approve' | 'disable' | 'enable' | 'reject') => http.post<AgentSkillDTO>(`/agents/skills/${id}/review`, { action }),
      deleteSkill: (id: string) => http.delete(`/agents/skills/${id}`),
      teamAgents: () => http.get<TeamAgentDTO[]>('/agents/team'),
      createTeamAgent: (input: CreateTeamAgentInput) => http.post<TeamAgentDTO>('/agents/team', input),
      updateTeamAgent: (id: string, input: UpdateTeamAgentInput) => http.patch<TeamAgentDTO>(`/agents/team/${id}`, input),
      runTeamAgent: (id: string, input: RunTeamAgentInput) => http.post<{ runId: string }>(`/agents/team/${id}/runs`, input),
      reportLocalResult: (approvalId: string, result: { ok: boolean; message: string }) => http.post<void>(`/agents/local-actions/${approvalId}/result`, result),
      messageToTask: (messageId: string) => http.post<{ cardId: string; projectId: string }>(`/agents/chat-messages/${messageId}/make-task`),
      cardRuns: (cardId: string) => http.get<CardAgentRunDTO[]>(`/agents/cards/${cardId}/runs`),
      usage: (month?: string) => http.get<AgentUsageDTO>('/agents/usage', { month }),
    },

    admin: {
      users: (query: { q?: string; status?: 'active' | 'deactivated' } = {}) =>
        http.get<AdminUserDTO[]>('/admin/users', query),
      createUser: (input: CreateUserInput) => http.post<AdminUserDTO>('/admin/users', input),
      setRole: (id: string, role: OrgRole) => http.patch<AdminUserDTO>(`/admin/users/${id}`, { role }),
      deactivate: (id: string, input: DeactivateUserInput) =>
        http.post<AdminUserDTO>(`/admin/users/${id}/deactivate`, input),
      reactivate: (id: string) => http.post<AdminUserDTO>(`/admin/users/${id}/reactivate`),
      revokeSessions: (id: string) => http.post<void>(`/admin/users/${id}/revoke-sessions`),
      invitations: () => http.get<InvitationDTO[]>('/admin/invitations'),
      invite: (input: CreateInvitationInput) =>
        http.post<CreateInvitationResponse>('/admin/invitations', input),
      revokeInvitation: (id: string) => http.delete(`/admin/invitations/${id}`),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
