import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AgentMessageDTO, UpdatePersonalAgentInput } from '@nexus/shared';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { socket } from '../../lib/socket';
import { ACTIVE, useAgentUi } from './store';

export const agentKeys = {
  root: ['agent'] as const,
  status: ['agent', 'status'] as const,
  providerSettings: ['agent', 'provider-settings'] as const,
  conversations: (q = '') => ['agent', 'conversations', q] as const,
  messages: (id: string) => ['agent', 'messages', id] as const,
  approvals: (ids: string) => ['agent', 'approvals', ids] as const,
  run: (id: string) => ['agent', 'run', id] as const,
  memories: ['agent', 'memories'] as const,
  schedules: ['agent', 'schedules'] as const,
  skills: ['agent', 'skills'] as const,
  knowledge: ['agent', 'knowledge'] as const,
  usage: (month: string) => ['agent', 'usage', month] as const,
};

export function useAgentStatus() {
  return useQuery({ queryKey: agentKeys.status, queryFn: api.agents.status, staleTime: 30_000 });
}

export function useConversations(q = '') {
  return useQuery({ queryKey: agentKeys.conversations(q), queryFn: () => api.agents.conversations(q) });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: agentKeys.messages(conversationId ?? ''),
    queryFn: () => api.agents.messages(conversationId!),
    enabled: Boolean(conversationId),
  });
}

/**
 * Mounted once in the app shell. The agent answers asynchronously, so its messages and run
 * progress arrive over the socket and are merged into the cache (deduplicated by id, so a
 * reconnect or a refetch never shows a message twice).
 */
export function useAgentRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const onMessage = ({ conversationId, message }: { conversationId: string; message: AgentMessageDTO }) => {
      qc.setQueryData<AgentMessageDTO[]>(agentKeys.messages(conversationId), (old) =>
        old ? (old.some((m) => m.id === message.id) ? old : [...old, message]) : old,
      );
      void qc.invalidateQueries({ queryKey: ['agent', 'conversations'] });
      if (message.metadata?.approvalIds?.length) void qc.invalidateQueries({ queryKey: ['agent', 'approvals'] });
    };
    const onRun = ({ conversationId, runId, status, label }: { conversationId: string | null; runId: string; status: Parameters<typeof ACTIVE.has>[0]; label?: string }) => {
      if (!conversationId) return;
      const { setLive } = useAgentUi.getState();
      if (ACTIVE.has(status)) setLive(conversationId, { runId, status, label });
      else {
        setLive(conversationId, undefined);
        // Cost, budget and the finished message all changed.
        void qc.invalidateQueries({ queryKey: agentKeys.status });
        void qc.invalidateQueries({ queryKey: agentKeys.messages(conversationId) });
      }
    };
    socket.on('agent:message', onMessage);
    socket.on('agent:run', onRun);
    return () => {
      socket.off('agent:message', onMessage);
      socket.off('agent:run', onRun);
    };
  }, [qc]);
}

export function useUpdatePersonalAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePersonalAgentInput) => api.agents.updatePersonal(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: agentKeys.status }),
    onError: (e) => toastError(e, 'Gagal menyimpan pengaturan asisten.'),
  });
}

export function useSendAgentMessage() {
  const qc = useQueryClient();
  const { setLive, openConversation } = useAgentUi.getState();
  return useMutation({
    mutationFn: (input: { content: string; conversationId: string | null }) =>
      api.agents.send({ content: input.content, conversationId: input.conversationId ?? undefined }),
    onSuccess: ({ conversationId, message, runId }) => {
      qc.setQueryData<AgentMessageDTO[]>(agentKeys.messages(conversationId), (old) =>
        old ? (old.some((m) => m.id === message.id) ? old : [...old, message]) : [message],
      );
      setLive(conversationId, { runId, status: 'QUEUED' });
      openConversation(conversationId);
      void qc.invalidateQueries({ queryKey: ['agent', 'conversations'] });
    },
    onError: (e) => toastError(e, 'Pesan tidak terkirim.'),
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api.agents.decide(id, approve),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agent', 'approvals'] });
      // The action may have created a card or comment.
      void qc.invalidateQueries({ queryKey: ['my-tasks'] });
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
    onError: (e) => toastError(e, 'Gagal memproses persetujuan.'),
  });
}

export function useCancelRun() {
  return useMutation({
    mutationFn: (runId: string) => api.agents.cancelRun(runId),
    onSuccess: () => toast.info('Menghentikan agent…'),
    onError: (e) => toastError(e, 'Gagal menghentikan.'),
  });
}
