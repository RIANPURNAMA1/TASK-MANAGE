import { z } from 'zod';
import type { ISODate } from './types';

// ─── Workbase Agent contract (playbook H1–H13) ────────────────────────

export const AGENT_PROVIDERS = ['ANTHROPIC', 'OPENAI', 'GEMINI', 'GROQ'] as const;
export type AgentProviderName = (typeof AGENT_PROVIDERS)[number];

export const AGENT_PROVIDER_LABEL: Record<AgentProviderName, string> = {
  ANTHROPIC: 'Claude (Anthropic)',
  OPENAI: 'GPT (OpenAI)',
  GEMINI: 'Gemini (Google)',
  GROQ: 'Groq',
};

export const AGENT_PERMISSIONS = ['tasks:read', 'cards:create', 'comments:write', 'web:read', 'knowledge:read', 'memory:write', 'agents:delegate', 'github:read', 'github:write', 'local:act'] as const;
export type AgentPermissionName = (typeof AGENT_PERMISSIONS)[number];

export const AGENT_PERMISSION_LABEL: Record<AgentPermissionName, string> = {
  'tasks:read': 'Membaca task dan proyek yang bisa saya akses',
  'cards:create': 'Mengusulkan kartu baru (menunggu konfirmasi saya)',
  'comments:write': 'Mengusulkan komentar di kartu (menunggu konfirmasi saya)',
  'web:read': 'Mencari dan membaca halaman web publik',
  'knowledge:read': 'Membaca dokumen knowledge base yang boleh saya akses',
  'memory:write': 'Menyimpan dan membaca memori pribadi',
  'agents:delegate': 'Memberi tugas ke agent lain (PM Agent / sub-agent)',
  'github:read': 'Membaca issue dan repo GitHub yang terhubung',
  'github:write': 'Mengusulkan pull request GitHub (selalu butuh persetujuan)',
  'local:act': 'Mengusulkan menulis file & membuka browser di komputer saya (aplikasi desktop, selalu butuh persetujuan)',
};

export type RunStatusName = 'QUEUED' | 'RUNNING' | 'WAITING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'NEEDS_REVIEW' | 'FAILED' | 'CANCELLED';
export const ACTIVE_RUN_STATUSES: RunStatusName[] = ['QUEUED', 'RUNNING', 'WAITING', 'AWAITING_APPROVAL'];

export interface PersonalAgentDTO {
  isActive: boolean;
  provider: AgentProviderName;
  model: string;
  delegatedPermissions: AgentPermissionName[];
  monthlyBudgetUsd: number;
  /** Estimated spend this calendar month (see AGENT_PRICING_JSON). */
  spentThisMonthUsd: number;
}

export interface AgentStatusDTO {
  /** Global kill switch (AGENT_ENABLED). */
  enabled: boolean;
  /** Providers whose API key is configured on the server. */
  providers: { provider: AgentProviderName; defaultModel: string }[];
  searchEnabled: boolean;
  personal: PersonalAgentDTO | null;
}

/** Where a provider's credentials come from: the settings UI, `.env`, or nowhere yet. */
export type AgentProviderSource = 'DB' | 'ENV' | 'NONE';

/** Admin-only view of one provider. The API key itself is never returned, only a masked hint. */
export interface AgentProviderSettingDTO {
  provider: AgentProviderName;
  model: string;
  source: AgentProviderSource;
  configured: boolean;
  keyHint: string | null;
  updatedAt: ISODate | null;
}

export interface AgentConversationDTO {
  id: string;
  title: string | null;
  updatedAt: ISODate;
  /** True while a run for this conversation is in progress. */
  busy: boolean;
}

export interface AgentMessageDTO {
  id: string;
  conversationId: string;
  role: 'USER' | 'AGENT' | 'SYSTEM';
  content: string;
  runId: string | null;
  metadata: { approvalIds?: string[]; warnings?: string[]; status?: RunStatusName } | null;
  createdAt: ISODate;
}

export interface AgentApprovalDTO {
  id: string;
  runId: string;
  toolName: string;
  summary: string;
  risk: 'internal_write' | 'external';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  createdAt: ISODate;
}

export interface AgentMemoryDTO {
  id: string;
  scope: 'USER' | 'PROJECT' | 'DIVISION' | 'ORG';
  scopeId: string;
  content: string;
  source: 'MANUAL' | 'AGENT_PROPOSED';
  status: 'PROPOSED' | 'ACTIVE' | 'ARCHIVED';
  createdAt: ISODate;
}

export interface KnowledgeDocDTO {
  id: string;
  title: string;
  scope: 'USER' | 'PROJECT' | 'DIVISION' | 'ORG';
  scopeId: string;
  status: 'UPLOADED' | 'INDEXING' | 'READY' | 'FAILED';
  chunkCount: number;
  createdAt: ISODate;
}

export interface AgentScheduleDTO {
  id: string;
  naturalText: string;
  cronExpr: string;
  /** Human description, e.g. "Setiap Senin pukul 08.00". */
  humanText: string;
  timezone: string;
  instruction: string;
  isActive: boolean;
  lastRunAt: ISODate | null;
  nextRunAt: ISODate | null;
}

export interface SchedulePreviewDTO {
  cronExpr: string;
  timezone: string;
  instruction: string;
  summary: string;
  humanText: string;
  next: ISODate[];
}

export interface AgentRunDTO {
  id: string;
  status: RunStatusName;
  instruction: string;
  result: string | null;
  error: string | null;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  warnings: string[];
  createdAt: ISODate;
  finishedAt: ISODate | null;
}

export interface AgentStepDTO {
  seq: number;
  type: 'LLM' | 'TOOL' | 'SYSTEM';
  toolName: string | null;
  input: unknown;
  output: string | null;
  isError: boolean;
  costUsd: number;
  durationMs: number;
}

export interface AgentSkillDTO {
  id: string;
  name: string;
  description: string;
  instructions: string;
  status: 'PROPOSED' | 'APPROVED' | 'DISABLED';
  version: number;
  successRate: number | null;
  uses: number;
  createdAt: ISODate;
}

export interface AgentUsageDTO {
  month: string;
  totalCostUsd: number;
  runs: number;
  completed: number;
  needsReview: number;
  failed: number;
  avgSteps: number;
  avgDurationSec: number;
  byDay: { date: string; costUsd: number; runs: number }[];
  byUser: { userId: string; name: string; costUsd: number; runs: number }[];
  topTools: { toolName: string; calls: number; failures: number }[];
  skills: { id: string; name: string; uses: number; successRate: number | null }[];
  /** Warnings for admins: cost spikes, failure spikes, users near their budget. */
  alerts: { level: 'warning' | 'critical'; message: string }[];
  /** Cost is derived from token counts × configured prices, so it is an estimate. */
  isEstimate: true;
}

/** Actions the desktop app may run on the owner's PC, after the owner approved them. */
export type LocalActionName = 'local_write_file' | 'local_open_url';
export interface LocalActionEvent {
  approvalId: string;
  tool: LocalActionName;
  input: Record<string, unknown>;
}

export interface AgentRealtime {
  /** Sent only to the owner's own sockets, only after they approved the action. Ignored by the web app. */
  'agent:local-action': (payload: LocalActionEvent) => void;
  'agent:message': (payload: { conversationId: string; message: AgentMessageDTO }) => void;
  'agent:run': (payload: { conversationId: string | null; runId: string; status: RunStatusName; label?: string }) => void;
}

// ─── schemas ───────────────────────────────────────────────────────────

const model = z.string().trim().min(1).max(100);

export const updatePersonalAgentSchema = z
  .object({
    isActive: z.boolean(),
    provider: z.enum(AGENT_PROVIDERS),
    model,
    delegatedPermissions: z.array(z.enum(AGENT_PERMISSIONS)).max(AGENT_PERMISSIONS.length),
    monthlyBudgetUsd: z.number().min(0).max(1000),
  })
  .partial();
export type UpdatePersonalAgentInput = z.infer<typeof updatePersonalAgentSchema>;

/** Admin → Settings → Asisten AI. Leaving `apiKey` empty keeps the key already stored. */
export const upsertAgentProviderSchema = z.object({
  apiKey: z.string().trim().min(8, 'API key terlalu pendek.').max(500).optional(),
  model: z.string().trim().min(1, 'Model wajib diisi.').max(100),
});
export type UpsertAgentProviderInput = z.infer<typeof upsertAgentProviderSchema>;

export const sendAgentMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  conversationId: z.string().min(1).max(40).optional(),
});
export type SendAgentMessageInput = z.infer<typeof sendAgentMessageSchema>;

export const createMemorySchema = z.object({
  content: z.string().trim().min(1).max(500),
  scope: z.enum(['USER', 'PROJECT', 'DIVISION', 'ORG']).default('USER'),
  scopeId: z.string().min(1).max(40).optional(),
});
export type CreateMemoryInput = z.input<typeof createMemorySchema>;

export const updateMemorySchema = z.object({ content: z.string().trim().min(1).max(500) });

export const scheduleTextSchema = z.object({ text: z.string().trim().min(3).max(500) });

export const confirmScheduleSchema = z.object({
  naturalText: z.string().trim().min(3).max(500),
  cronExpr: z.string().trim().min(9).max(100),
  timezone: z.string().trim().min(3).max(60).default('Asia/Jakarta'),
  instruction: z.string().trim().min(3).max(2000),
});
export type ConfirmScheduleInput = z.input<typeof confirmScheduleSchema>;

export const updateScheduleSchema = z.object({ isActive: z.boolean() });

export const saveSkillSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1000),
  instructions: z.string().trim().min(10).max(4000),
});
export type SaveSkillInput = z.infer<typeof saveSkillSchema>;

// ─── Team agents (H11/H12) ─────────────────────────────────────────────

export interface TeamAgentDTO {
  id: string;
  name: string;
  description: string | null;
  divisionId: string | null;
  provider: AgentProviderName;
  model: string;
  systemPrompt: string | null;
  autonomyLevel: 0 | 1 | 2;
  allowedTools: AgentPermissionName[];
  monthlyBudgetUsd: number;
  spentThisMonthUsd: number;
  isActive: boolean;
  /** The account to add to projects (as a member) so the agent can see and edit them. */
  botUser: { id: string; name: string; email: string } | null;
}

export const createTeamAgentSchema = z.object({
  name: z.string().trim().min(2).max(60).regex(/^[\p{L}\p{N}_-]+$/u, 'Nama agent hanya huruf, angka, - dan _ (tanpa spasi), supaya bisa di-@mention.'),
  description: z.string().trim().max(500).optional(),
  divisionId: z.string().min(1).max(40).optional(),
  provider: z.enum(AGENT_PROVIDERS),
  model: z.string().trim().min(1).max(100),
  systemPrompt: z.string().trim().max(4000).optional(),
  autonomyLevel: z.number().int().min(0).max(2).default(1),
  allowedTools: z.array(z.enum(AGENT_PERMISSIONS)).max(AGENT_PERMISSIONS.length),
  monthlyBudgetUsd: z.number().min(0).max(10_000).default(20),
});
export type CreateTeamAgentInput = z.input<typeof createTeamAgentSchema>;

export const updateTeamAgentSchema = createTeamAgentSchema.omit({ name: true, divisionId: true }).partial().extend({ isActive: z.boolean().optional() });
export type UpdateTeamAgentInput = z.input<typeof updateTeamAgentSchema>;

export const runTeamAgentSchema = z.object({
  instruction: z.string().trim().min(3).max(3000),
  cardId: z.string().min(1).max(40).optional(),
  projectId: z.string().min(1).max(40).optional(),
});
export type RunTeamAgentInput = z.infer<typeof runTeamAgentSchema>;

/** One run shown on a card (the agent that worked on it and its sub-runs). */
export interface CardAgentRunDTO {
  id: string;
  parentRunId: string | null;
  agentName: string;
  status: RunStatusName;
  instruction: string;
  result: string | null;
  costUsd: number;
  createdAt: ISODate;
  finishedAt: ISODate | null;
}

// ─── Connectors (H5) ───────────────────────────────────────────────────

export const CONNECTOR_PROVIDERS = ['GITHUB'] as const;
export interface ConnectionDTO {
  provider: (typeof CONNECTOR_PROVIDERS)[number];
  status: 'ACTIVE' | 'NEEDS_RECONNECT';
  /** Who connected it and the account it resolves to; the token itself is never returned. */
  accountLabel: string;
  connectedAt: ISODate;
}
export const connectGithubSchema = z.object({ token: z.string().trim().min(20).max(300) });
