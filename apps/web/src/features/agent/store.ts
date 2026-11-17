import { create } from 'zustand';
import type { RunStatusName } from '@nexus/shared';

interface LiveRun {
  runId: string;
  status: RunStatusName;
  /** The tool the agent is using right now, for the "sedang bekerja…" line. */
  label?: string;
}

interface AgentUiState {
  open: boolean;
  /** Conversation shown in the panel; null = a new one starts with the next message. */
  conversationId: string | null;
  /** In-flight run per conversation (key '' = a conversation that doesn't exist yet). */
  live: Record<string, LiveRun | undefined>;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  openConversation: (id: string | null) => void;
  setLive: (conversationId: string, run: LiveRun | undefined) => void;
}

export const useAgentUi = create<AgentUiState>((set) => ({
  open: false,
  conversationId: null,
  live: {},
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  openConversation: (conversationId) => set({ conversationId, open: true }),
  setLive: (conversationId, run) => set((s) => ({ live: { ...s.live, [conversationId]: run } })),
}));

export const ACTIVE = new Set<RunStatusName>(['QUEUED', 'RUNNING', 'WAITING']);

/** Indonesian labels for the tools the agent can call, shown while it works. */
export const TOOL_LABEL: Record<string, string> = {
  find_projects: 'mencari proyek',
  list_my_tasks: 'membaca task Anda',
  summarize_project: 'merangkum proyek',
  get_card: 'membaca kartu',
  create_card_draft: 'menyiapkan kartu',
  add_comment: 'menyiapkan komentar',
  web_search: 'mencari di web',
  fetch_page: 'membuka halaman web',
  search_knowledge: 'mencari di knowledge base',
  recall: 'mengingat',
  remember: 'menyimpan memori',
  update_plan: 'memperbarui rencana',
};
