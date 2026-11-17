import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertTriangle, Check, ChevronDown, History, Plus, Send, Settings2, Sparkles, Square, Trash2, X } from 'lucide-react';
import type { AgentApprovalDTO, AgentMessageDTO } from '@nexus/shared';
import { Button, Spinner, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { AgentMarkdown } from './AgentMarkdown';
import {
  agentKeys,
  useAgentStatus,
  useCancelRun,
  useConversations,
  useDecideApproval,
  useMessages,
  useSendAgentMessage,
  useUpdatePersonalAgent,
} from './hooks';
import { TOOL_LABEL, useAgentUi } from './store';

const SUGGESTIONS = ['Apa saja task saya yang overdue?', 'Ringkas progres proyek saya minggu ini', 'Task apa yang jatuh tempo hari ini?'];

/** Right-hand drawer with the Personal Agent chat. Toggle with Ctrl/Cmd + J from any page. */
export function AgentPanel() {
  const { open, conversationId, setOpen } = useAgentUi();
  const status = useAgentStatus();

  if (!open) return null;
  return (
    <aside
      aria-label="Asisten AI"
      className="flex h-full w-[400px] max-w-[92vw] shrink-0 flex-col border-l border-line bg-surface max-md:fixed max-md:inset-y-0 max-md:right-0 max-md:z-40 max-md:shadow-modal"
    >
      <Header />
      {status.isPending ? (
        <div className="flex flex-1 items-center justify-center text-brand">
          <Spinner />
        </div>
      ) : !status.data?.enabled ? (
        <Notice title="Fitur asisten AI dinonaktifkan" body="Administrator mematikan fitur ini di server." />
      ) : status.data.providers.length === 0 ? (
        <Notice title="Belum ada penyedia LLM" body="Administrator dapat menambahkan API key penyedia di Pengaturan → Asisten AI." />
      ) : !status.data.personal?.isActive ? (
        <Onboarding />
      ) : (
        <Conversation key={conversationId ?? 'new'} conversationId={conversationId} />
      )}
      <button type="button" aria-label="Tutup" onClick={() => setOpen(false)} className="sr-only">
        Tutup
      </button>
    </aside>
  );
}

/** Global shortcut + realtime. Rendered once by the app shell. */
export function AgentShortcut() {
  const toggle = useAgentUi((s) => s.toggle);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
  return null;
}

function Header() {
  const { setOpen, openConversation, conversationId } = useAgentUi();
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-subtle text-brand">
        <Sparkles className="h-4 w-4" />
      </span>
      <h2 className="flex-1 truncate text-[0.9375rem] font-semibold text-ink">Asisten AI</h2>
      <Button variant="ghost" size="icon" aria-label="Percakapan baru" title="Percakapan baru" onClick={() => openConversation(null)} disabled={!conversationId}>
        <Plus className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" aria-label="Riwayat" title="Riwayat" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
        <History className="h-4 w-4" />
      </Button>
      <Link to="/settings?tab=agent" aria-label="Pengaturan asisten" title="Pengaturan asisten" className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas-deep hover:text-ink">
        <Settings2 className="h-4 w-4" />
      </Link>
      <Button variant="ghost" size="icon" aria-label="Tutup panel" title="Tutup (Ctrl+J)" onClick={() => setOpen(false)}>
        <X className="h-4 w-4" />
      </Button>
      {historyOpen && <History_ onClose={() => setHistoryOpen(false)} />}
    </header>
  );
}

function History_({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const conversations = useConversations(q);
  const { openConversation } = useAgentUi();
  return (
    <div className="absolute inset-x-3 top-14 z-10 rounded-xl border border-line bg-surface p-2 shadow-modal">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Cari percakapan…"
        autoFocus
        className="mb-1 h-8 w-full rounded-lg border border-line bg-canvas px-2.5 text-body outline-none focus:border-line-focus"
      />
      <ul className="max-h-72 overflow-y-auto">
        {(conversations.data ?? []).map((c) => (
          <li key={c.id} className="group flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                openConversation(c.id);
                onClose();
              }}
              className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left hover:bg-canvas-deep"
            >
              <span className="block truncate text-[0.8125rem] font-medium text-ink">{c.title ?? 'Percakapan'}</span>
              <span className="block text-caption text-ink-subtle">{formatRelative(c.updatedAt)}</span>
            </button>
            <button
              type="button"
              aria-label="Hapus percakapan"
              onClick={() => {
                void api.agents.deleteConversation(c.id).then(() => void conversations.refetch());
              }}
              className="rounded-md p-1.5 text-ink-subtle opacity-0 hover:bg-canvas-deep hover:text-danger-ink group-hover:opacity-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {conversations.data?.length === 0 && <li className="px-2.5 py-4 text-center text-caption text-ink-subtle">Belum ada percakapan.</li>}
      </ul>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-8 text-center">
      <AlertTriangle className="h-6 w-6 text-warning" />
      <p className="text-[0.9375rem] font-semibold text-ink">{title}</p>
      <p className="text-[0.8125rem] text-ink-muted">{body}</p>
    </div>
  );
}

function Onboarding() {
  const update = useUpdatePersonalAgent();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
        <Sparkles className="h-6 w-6" />
      </span>
      <p className="text-[1rem] font-semibold text-ink">Asisten pribadi untuk pekerjaan Anda</p>
      <p className="text-[0.8125rem] text-ink-muted">
        Tanya task yang terlambat, minta ringkasan proyek, atau cari di knowledge base. Asisten hanya bisa melihat apa yang boleh Anda lihat, dan selalu meminta konfirmasi sebelum mengubah data.
      </p>
      <Button loading={update.isPending} onClick={() => update.mutate({ isActive: true })}>
        Aktifkan asisten
      </Button>
      <Link to="/settings?tab=agent" className="text-caption text-brand hover:underline">
        Atur izin dan penyedia dulu
      </Link>
    </div>
  );
}

function Conversation({ conversationId }: { conversationId: string | null }) {
  const messages = useMessages(conversationId);
  const live = useAgentUi((s) => s.live[conversationId ?? ''] ?? (conversationId ? undefined : undefined));
  const send = useSendAgentMessage();
  const cancel = useCancelRun();
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const busy = Boolean(live) || send.isPending;

  const list = messages.data ?? [];
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [list.length, live?.label, busy]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const content = text.trim();
    if (!content || busy) return;
    setText('');
    send.mutate({ content, conversationId });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit();
  };

  return (
    <>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.isPending && conversationId && (
          <div className="flex justify-center py-6 text-brand">
            <Spinner />
          </div>
        )}
        {!conversationId && list.length === 0 && (
          <div className="space-y-2 pt-2">
            <p className="text-[0.875rem] text-ink-muted">Halo! Apa yang bisa saya bantu?</p>
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => send.mutate({ content: s, conversationId: null })} className="block w-full rounded-xl border border-line px-3 py-2 text-left text-[0.8125rem] text-ink-muted transition-colors hover:border-brand-border hover:bg-brand-soft hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}
        {list.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-[0.8125rem] text-ink-subtle">
            <Spinner />
            <span>{live?.label ? `Sedang ${TOOL_LABEL[live.label] ?? live.label}…` : 'Sedang bekerja…'}</span>
            {live && (
              <button type="button" onClick={() => cancel.mutate(live.runId)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-caption font-medium text-ink-muted hover:bg-canvas-deep hover:text-ink">
                <Square className="h-3 w-3" /> Berhenti
              </button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={submit} className="shrink-0 border-t border-line p-3">
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-canvas p-2 focus-within:border-line-focus">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            rows={1}
            maxLength={4000}
            placeholder="Tanya asisten…"
            aria-label="Pesan untuk asisten"
            className="max-h-32 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none outline-none focus:ring-0"
          />
          <Button type="submit" size="icon" aria-label="Kirim" disabled={!text.trim() || busy}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-ink-subtle">Enter kirim · Shift+Enter baris baru · Jawaban AI bisa keliru, periksa hal penting.</p>
      </form>
    </>
  );
}

function MessageBubble({ message }: { message: AgentMessageDTO }) {
  const mine = message.role === 'USER';
  const system = message.role === 'SYSTEM';
  const [showSteps, setShowSteps] = useState(false);
  const approvalIds = message.metadata?.approvalIds ?? [];

  return (
    <div className={clsx('flex flex-col gap-1.5', mine ? 'items-end' : 'items-start')}>
      <div
        className={clsx(
          'max-w-[92%] rounded-2xl px-3.5 py-2.5',
          mine ? 'rounded-br-md bg-brand text-white' : system ? 'bg-canvas-deep text-ink-muted' : 'rounded-bl-md border border-line bg-canvas text-ink',
        )}
      >
        {mine ? <p className="whitespace-pre-wrap break-words text-[0.875rem]">{message.content}</p> : <AgentMarkdown text={message.content} />}
      </div>

      {message.metadata?.warnings?.map((w) => (
        <p key={w} className="flex max-w-[92%] items-start gap-1.5 rounded-lg bg-warning-soft px-2.5 py-1.5 text-caption text-warning-ink">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" /> {w}
        </p>
      ))}

      {approvalIds.length > 0 && <Approvals ids={approvalIds} />}

      {message.role === 'AGENT' && message.runId && (
        <button type="button" onClick={() => setShowSteps((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-ink-subtle hover:text-ink">
          <ChevronDown className={clsx('h-3 w-3 transition-transform', showSteps && 'rotate-180')} /> Lihat langkah
        </button>
      )}
      {showSteps && message.runId && <RunSteps runId={message.runId} />}
    </div>
  );
}

function Approvals({ ids }: { ids: string[] }) {
  const key = ids.join(',');
  const approvals = useQuery({ queryKey: agentKeys.approvals(key), queryFn: () => api.agents.approvals(ids) });
  const decide = useDecideApproval();
  return (
    <div className="w-full max-w-[92%] space-y-1.5">
      {(approvals.data ?? []).map((a: AgentApprovalDTO) => (
        <div key={a.id} className="rounded-xl border border-brand-border bg-brand-soft px-3 py-2.5">
          <p className="text-[0.8125rem] font-medium text-ink">{a.summary}</p>
          {a.status === 'PENDING' ? (
            <div className="mt-2 flex gap-2">
              <Button size="sm" icon={<Check className="h-3.5 w-3.5" />} loading={decide.isPending} onClick={() => decide.mutate({ id: a.id, approve: true })}>
                Ya, lakukan
              </Button>
              <Button size="sm" variant="secondary" disabled={decide.isPending} onClick={() => decide.mutate({ id: a.id, approve: false })}>
                Tidak
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-caption text-ink-subtle">{a.status === 'APPROVED' ? 'Disetujui' : a.status === 'REJECTED' ? 'Dibatalkan' : 'Kedaluwarsa'}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function RunSteps({ runId }: { runId: string }) {
  const run = useQuery({ queryKey: agentKeys.run(runId), queryFn: () => api.agents.run(runId) });
  const steps = useMemo(() => run.data?.steps ?? [], [run.data]);
  if (run.isPending) return <Spinner />;
  return (
    <div className="w-full max-w-[92%] rounded-xl border border-line-subtle bg-canvas p-2.5 text-caption text-ink-muted">
      <ol className="space-y-1">
        {steps.map((s) => (
          <li key={s.seq} className="flex gap-2">
            <span className="w-4 shrink-0 tabular-nums text-ink-subtle">{s.seq + 1}</span>
            <span className={clsx('min-w-0 flex-1 truncate', s.isError && 'text-danger-ink')}>
              {s.type === 'LLM' ? 'Berpikir' : `Tool: ${TOOL_LABEL[s.toolName ?? ''] ?? s.toolName}`}
              {s.isError && ' (gagal)'}
            </span>
            <span className="tabular-nums text-ink-subtle">{(s.durationMs / 1000).toFixed(1)}s</span>
          </li>
        ))}
      </ol>
      {run.data && (
        <p className="mt-1.5 border-t border-line-subtle pt-1.5 text-ink-subtle">
          Perkiraan biaya US$ {run.data.run.costUsd.toFixed(4)} · {run.data.run.inputTokens + run.data.run.outputTokens} token
        </p>
      )}
    </div>
  );
}
