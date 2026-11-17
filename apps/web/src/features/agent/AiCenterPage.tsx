import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { BookOpen, Download, OctagonX, Sparkles, Trash2, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentSkillDTO } from '@nexus/shared';
import { Button, ConfirmDialog, ErrorState, Field, Input, Segmented, Skeleton, Textarea } from '../../components/ui';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { useCurrentUser } from '../../stores/auth';
import { downloadCsv } from '../dashboard/csv';
import { SettingsCard } from '../settings/SettingsCard';
import { agentKeys } from './hooks';

type Tab = 'usage' | 'skills' | 'knowledge';

const usd = (n: number) => `US$ ${n.toFixed(n < 1 ? 4 : 2)}`;

/** Admin / Division Lead console: spend and reliability, the skill library, shared knowledge. */
export function AiCenterPage() {
  const [tab, setTab] = useState<Tab>('usage');
  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="border-b border-line bg-surface px-8 pb-5 pt-7">
        <h1 className="flex items-center gap-3 text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">
          <Sparkles className="h-[22px] w-[22px] text-brand" aria-hidden />
          Pusat AI
        </h1>
        <p className="mt-2 text-[0.875rem] text-ink-muted">Pantau biaya dan keandalan agent, kelola skill yang dipelajari, dan dokumen knowledge base.</p>
        <div className="mt-4">
          <Segmented
            items={[
              { value: 'usage' as const, label: 'Penggunaan' },
              { value: 'skills' as const, label: 'Skill' },
              { value: 'knowledge' as const, label: 'Knowledge base' },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>
      </header>
      <div className="flex-1 space-y-5 px-8 py-6">
        {tab === 'usage' && <UsageTab />}
        {tab === 'skills' && <SkillsTab />}
        {tab === 'knowledge' && <KnowledgeTab />}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-inset ring-line-subtle">
      <p className="text-[0.8125rem] text-ink-muted">{label}</p>
      <p className="mt-1 text-[1.5rem] font-semibold tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-caption text-ink-subtle">{hint}</p>}
    </div>
  );
}

function UsageTab() {
  const user = useCurrentUser();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [confirmStop, setConfirmStop] = useState(false);
  const usage = useQuery({ queryKey: agentKeys.usage(month), queryFn: () => api.agents.usage(month), retry: false });
  const stop = useMutation({
    mutationFn: () => api.agents.cancelAll(),
    onSuccess: (r) => {
      toast.success(`${r.cancelled} run dihentikan.`);
      setConfirmStop(false);
    },
    onError: (e) => toastError(e),
  });

  if (usage.isPending) return <Skeleton className="h-72 rounded-2xl" />;
  if (usage.isError) return <ErrorState error={usage.error} onRetry={() => void usage.refetch()} />;
  const u = usage.data;
  const maxDay = Math.max(0.0001, ...u.byDay.map((d) => d.costUsd));
  const done = u.completed + u.needsReview + u.failed;
  const isAdmin = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Field label="Bulan" className="w-44">
          {(id) => <Input id={id} type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
        </Field>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            icon={<Download className="h-4 w-4" />}
            onClick={() => downloadCsv(`biaya-agent-${u.month}.csv`, u.byUser, [
              { header: 'Pengguna', value: (r) => r.name },
              { header: 'Jumlah run', value: (r) => r.runs },
              { header: 'Perkiraan biaya (USD)', value: (r) => r.costUsd.toFixed(6) },
            ])}
          >
            Ekspor CSV
          </Button>
          {isAdmin && (
            <Button variant="danger" icon={<OctagonX className="h-4 w-4" />} onClick={() => setConfirmStop(true)}>
              Hentikan semua run
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Perkiraan biaya" value={usd(u.totalCostUsd)} hint="Token × harga yang dikonfigurasi" />
        <Stat label="Jumlah run" value={String(u.runs)} hint={`${u.avgSteps.toFixed(1)} langkah rata-rata`} />
        <Stat label="Berhasil" value={done ? `${Math.round((u.completed / done) * 100)}%` : '—'} hint={`${u.needsReview} perlu review · ${u.failed} gagal`} />
        <Stat label="Durasi rata-rata" value={`${u.avgDurationSec.toFixed(1)} dtk`} />
      </div>

      <SettingsCard title="Biaya per hari" description="Perkiraan, bukan tagihan resmi dari penyedia.">
        {u.byDay.length === 0 ? (
          <p className="text-[0.875rem] text-ink-subtle">Belum ada run di bulan ini.</p>
        ) : (
          <div className="flex h-40 items-end gap-1" role="img" aria-label="Grafik biaya per hari">
            {u.byDay.map((d) => (
              <div key={d.date} className="group relative flex h-full flex-1 items-end" title={`${d.date}: ${usd(d.costUsd)} · ${d.runs} run`}>
                <div className="w-full rounded-t-md bg-brand" style={{ height: `${Math.max(3, (d.costUsd / maxDay) * 100)}%` }} />
              </div>
            ))}
          </div>
        )}
      </SettingsCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <SettingsCard title="Per pengguna" bodyClassName="">
          <Table head={['Pengguna', 'Run', 'Biaya']} rows={u.byUser.map((r) => [r.name, String(r.runs), usd(r.costUsd)])} empty="Belum ada data." />
        </SettingsCard>
        <SettingsCard title="Tool paling sering dipakai" bodyClassName="">
          <Table head={['Tool', 'Panggilan', 'Gagal']} rows={u.topTools.map((t) => [t.toolName, String(t.calls), String(t.failures)])} empty="Belum ada data." />
        </SettingsCard>
      </div>

      <ConfirmDialog
        open={confirmStop}
        title="Hentikan semua run?"
        description="Semua agent yang sedang bekerja di organisasi ini dihentikan segera. Pesan yang belum selesai tidak akan dijawab."
        confirmLabel="Hentikan semua"
        destructive
        loading={stop.isPending}
        onConfirm={() => stop.mutate()}
        onClose={() => setConfirmStop(false)}
      />
    </>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: string[][]; empty: string }) {
  if (rows.length === 0) return <p className="px-6 py-5 text-[0.875rem] text-ink-subtle">{empty}</p>;
  return (
    <table className="w-full text-[0.875rem]">
      <thead>
        <tr className="border-b border-line-subtle text-left text-caption text-ink-subtle">
          {head.map((h, i) => (
            <th key={h} className={clsx('px-6 py-2 font-medium', i > 0 && 'text-right')}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-line-subtle last:border-0">
            {r.map((c, j) => (
              <td key={j} className={clsx('px-6 py-2', j > 0 ? 'text-right tabular-nums text-ink-muted' : 'text-ink')}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const STATUS_LABEL = { PROPOSED: 'Usulan', APPROVED: 'Aktif', DISABLED: 'Nonaktif' } as const;

function SkillsTab() {
  const qc = useQueryClient();
  const skills = useQuery({ queryKey: agentKeys.skills, queryFn: api.agents.skills });
  const refresh = () => void qc.invalidateQueries({ queryKey: agentKeys.skills });
  const review = useMutation({ mutationFn: ({ id, action }: { id: string; action: 'approve' | 'disable' | 'enable' | 'reject' }) => api.agents.reviewSkill(id, action), onSuccess: refresh, onError: (e) => toastError(e) });
  const remove = useMutation({ mutationFn: (id: string) => api.agents.deleteSkill(id), onSuccess: refresh, onError: (e) => toastError(e) });
  const [form, setForm] = useState({ name: '', description: '', instructions: '' });
  const create = useMutation({
    mutationFn: () => api.agents.createSkill(form),
    onSuccess: () => {
      setForm({ name: '', description: '', instructions: '' });
      refresh();
    },
    onError: (e) => toastError(e, 'Skill tidak valid.'),
  });

  if (skills.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (skills.isError) return <ErrorState error={skills.error} onRetry={() => void skills.refetch()} />;

  return (
    <>
      <SettingsCard title="Library skill" description="Skill adalah prosedur yang dipakai agent. Hanya yang berstatus Aktif yang dimuat ke prompt; usulan harus disetujui dulu.">
        <ul className="divide-y divide-line-subtle">
          {skills.data.map((s: AgentSkillDTO) => (
            <li key={s.id} className="py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                    <Wand2 className="h-4 w-4 text-brand" /> {s.name}
                    <span className={clsx('rounded-full px-2 py-0.5 text-[11px] font-medium', s.status === 'APPROVED' ? 'bg-success-soft text-success-ink' : s.status === 'PROPOSED' ? 'bg-warning-soft text-warning-ink' : 'bg-canvas-deep text-ink-subtle')}>
                      {STATUS_LABEL[s.status]}
                    </span>
                    <span className="text-caption font-normal text-ink-subtle">v{s.version}</span>
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{s.description}</p>
                  <details className="mt-1 text-[0.8125rem] text-ink-muted">
                    <summary className="cursor-pointer text-caption text-ink-subtle">Lihat instruksi</summary>
                    <p className="mt-1 whitespace-pre-wrap">{s.instructions}</p>
                  </details>
                  <p className="mt-1 text-caption text-ink-subtle">
                    {s.uses} pemakaian{s.successRate !== null && ` · ${Math.round(s.successRate * 100)}% berhasil`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {s.status === 'PROPOSED' && <Button size="sm" onClick={() => review.mutate({ id: s.id, action: 'approve' })}>Setujui</Button>}
                  {s.status === 'APPROVED' && <Button size="sm" variant="secondary" onClick={() => review.mutate({ id: s.id, action: 'disable' })}>Nonaktifkan</Button>}
                  {s.status === 'DISABLED' && <Button size="sm" variant="secondary" onClick={() => review.mutate({ id: s.id, action: 'enable' })}>Aktifkan</Button>}
                  <Button size="icon" variant="ghost" aria-label="Hapus skill" onClick={() => remove.mutate(s.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            </li>
          ))}
          {skills.data.length === 0 && <li className="py-6 text-center text-[0.875rem] text-ink-subtle">Belum ada skill.</li>}
        </ul>
      </SettingsCard>

      <SettingsCard title="Tambah skill" description="Skill yang Anda tulis sendiri sebagai Admin/Lead langsung aktif." footer={<Button loading={create.isPending} disabled={form.name.length < 3 || form.description.length < 10 || form.instructions.length < 10} onClick={() => create.mutate()}>Simpan skill</Button>}>
        <div className="space-y-4">
          <Field label="Nama">{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={120} />}</Field>
          <Field label="Kapan dipakai" hint="Dipakai untuk mencocokkan skill dengan permintaan.">{(id) => <Textarea id={id} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} />}</Field>
          <Field label="Instruksi" hint="Langkah-langkah, kriteria kualitas, dan kesalahan yang perlu dihindari.">{(id) => <Textarea id={id} rows={5} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} maxLength={4000} />}</Field>
        </div>
      </SettingsCard>
    </>
  );
}

function KnowledgeTab() {
  const qc = useQueryClient();
  const docs = useQuery({ queryKey: agentKeys.knowledge, queryFn: api.agents.knowledge });
  const refresh = () => void qc.invalidateQueries({ queryKey: agentKeys.knowledge });
  const [form, setForm] = useState({ title: '', content: '', scope: 'ORG' as 'ORG' | 'USER' });
  const add = useMutation({
    mutationFn: () => api.agents.addKnowledge(form),
    onSuccess: () => {
      toast.success('Dokumen ditambahkan.');
      setForm({ title: '', content: '', scope: form.scope });
      refresh();
    },
    onError: (e) => toastError(e, 'Dokumen ditolak.'),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.agents.deleteKnowledge(id), onSuccess: refresh, onError: (e) => toastError(e) });

  return (
    <>
      <SettingsCard title="Dokumen" description="Agent mencari di dokumen ini saat menjawab. Ia hanya melihat dokumen dari lingkup yang boleh diakses pengguna yang bertanya.">
        {docs.isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {(docs.data ?? []).map((d) => (
              <li key={d.id} className="flex items-center gap-3 py-2.5">
                <BookOpen className="h-4 w-4 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.875rem] font-medium text-ink">{d.title}</p>
                  <p className="text-caption text-ink-subtle">{d.scope} · {d.chunkCount} potongan · {d.status}</p>
                </div>
                <Button size="icon" variant="ghost" aria-label="Hapus dokumen" onClick={() => remove.mutate(d.id)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
            {docs.data?.length === 0 && <li className="py-6 text-center text-[0.875rem] text-ink-subtle">Belum ada dokumen.</li>}
          </ul>
        )}
      </SettingsCard>

      <SettingsCard
        title="Tambah dokumen teks"
        description="Tempel isi SOP atau panduan (teks / Markdown). Unggah PDF dan DOCX belum tersedia: butuh worker indeks yang belum dipasang."
        footer={<Button loading={add.isPending} disabled={form.title.trim().length < 2 || form.content.trim().length < 20} onClick={() => add.mutate()}>Tambahkan</Button>}
      >
        <div className="space-y-4">
          <Field label="Judul">{(id) => <Input id={id} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={255} />}</Field>
          <Field label="Lingkup" hint="Organisasi hanya bisa diisi Admin; Pribadi hanya terlihat oleh Anda.">
            {(id) => (
              <select id={id} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as 'ORG' | 'USER' })} className="h-9 w-full rounded-lg border border-line bg-canvas px-3 text-body text-ink">
                <option value="ORG">Seluruh organisasi</option>
                <option value="USER">Pribadi</option>
              </select>
            )}
          </Field>
          <Field label="Isi">{(id) => <Textarea id={id} rows={10} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />}</Field>
        </div>
      </SettingsCard>
    </>
  );
}
