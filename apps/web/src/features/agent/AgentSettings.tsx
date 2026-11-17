import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CalendarClock, Check, Pause, Play, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  AGENT_PERMISSIONS,
  AGENT_PERMISSION_LABEL,
  AGENT_PROVIDERS,
  AGENT_PROVIDER_LABEL,
  type AgentPermissionName,
  type AgentProviderName,
  type SchedulePreviewDTO,
} from '@nexus/shared';
import { Badge, Button, ConfirmDialog, Field, Input, Select, Skeleton, Toggle } from '../../components/ui';
import { api } from '../../lib/api';
import { toastError } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { useCurrentUser } from '../../stores/auth';
import { SettingsCard } from '../settings/SettingsCard';
import { agentKeys, useAgentStatus, useUpdatePersonalAgent } from './hooks';

/** Settings → Asisten AI: provider keys (admins), activation, permissions, memory and schedules. */
export function AgentSettingsSection() {
  const status = useAgentStatus();
  const user = useCurrentUser();
  const isAdmin = user.orgRole === 'OWNER' || user.orgRole === 'ADMIN';

  if (status.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  const data = status.data;
  if (!data?.enabled) {
    return <SettingsCard title="Asisten AI">Fitur ini dinonaktifkan oleh administrator.</SettingsCard>;
  }

  const hasProviders = data.providers.length > 0;
  return (
    <>
      {isAdmin && <ProviderConfigCard />}
      {hasProviders ? (
        <>
          <PersonalCard />
          {data.personal?.isActive && (
            <>
              <MemoryCard />
              <SchedulesCard />
            </>
          )}
        </>
      ) : (
        <SettingsCard
          title="Asisten AI"
          description={isAdmin ? 'Tambahkan API key penyedia di atas untuk mengaktifkan asisten.' : 'Belum ada penyedia LLM yang dikonfigurasi.'}
        >
          <p className="text-[0.875rem] text-ink-muted">
            {isAdmin
              ? 'Setelah API key disimpan, seluruh anggota bisa memilih penyedia dan model default-nya di halaman ini.'
              : 'Minta administrator menambahkan API key penyedia di Pengaturan → Asisten AI.'}
          </p>
        </SettingsCard>
      )}
      <SettingsCard title="Pusat AI" description="Dashboard biaya, library skill, dan knowledge base (Admin dan Division Lead).">
        <Link to="/ai" className="text-[0.875rem] font-medium text-brand hover:underline">
          Buka Pusat AI →
        </Link>
      </SettingsCard>
    </>
  );
}

/** Admin-only: add or replace provider API keys and the default model employees start with. */
function ProviderConfigCard() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: agentKeys.providerSettings, queryFn: api.agents.providerSettings, retry: false });
  const [provider, setProvider] = useState<AgentProviderName>('ANTHROPIC');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<AgentProviderName | null>(null);

  const rows = settings.data ?? [];
  const selected = rows.find((r) => r.provider === provider);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: agentKeys.providerSettings });
    void qc.invalidateQueries({ queryKey: agentKeys.status });
  };

  // Switching provider (or a successful save) loads that provider's current model.
  useEffect(() => {
    setApiKey('');
    setModel(settings.data?.find((r) => r.provider === provider)?.model ?? '');
  }, [provider, settings.data]);

  const save = useMutation({
    mutationFn: () => api.agents.saveProviderSetting(provider, { apiKey: apiKey.trim() || undefined, model: model.trim() }),
    onSuccess: (row) => {
      toast.success(`${AGENT_PROVIDER_LABEL[row.provider]} disimpan.`);
      setApiKey('');
      refresh();
    },
    onError: (e) => toastError(e, 'Gagal menyimpan penyedia.'),
  });

  const remove = useMutation({
    mutationFn: (p: AgentProviderName) => api.agents.deleteProviderSetting(p),
    onSuccess: () => {
      toast.success('API key dihapus dari pengaturan.');
      setConfirmDelete(null);
      refresh();
    },
    onError: (e) => toastError(e, 'Gagal menghapus penyedia.'),
  });

  // Saving model-only is allowed once a key is stored here; a `.env` key is only replaced by submitting a new key.
  const hasStoredKey = selected?.source === 'DB';
  const canSave = model.trim().length > 0 && (hasStoredKey || apiKey.trim().length >= 8) && !save.isPending;
  const keyHint = !selected || selected.source === 'NONE'
    ? 'Wajib diisi saat pertama kali mengatur penyedia ini.'
    : selected.source === 'ENV'
      ? `Saat ini memakai key dari .env${selected.keyHint ? ` (${selected.keyHint})` : ''}. Isi key baru untuk menimpanya dari pengaturan ini.`
      : `Sudah tersimpan${selected.keyHint ? ` (${selected.keyHint})` : ''}. Kosongkan untuk mempertahankan key yang ada.`;

  return (
    <SettingsCard
      title="Penyedia LLM"
      description="API key disimpan terenkripsi di server, tidak pernah ditampilkan lagi. Key dari .env tetap dipakai selama belum diganti di sini."
    >
      {settings.isPending ? (
        <Skeleton className="h-36 rounded-xl" />
      ) : settings.isError ? (
        <p className="text-[0.875rem] text-danger-ink">Daftar penyedia tidak bisa dimuat. Coba muat ulang halaman.</p>
      ) : (
        <ul className="divide-y divide-line-subtle">
          {rows.map((row) => (
            <li key={row.provider} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[0.875rem] font-medium text-ink">
                  {AGENT_PROVIDER_LABEL[row.provider]}
                  <Badge tone={row.configured ? 'success' : 'neutral'}>{row.configured ? 'Terhubung' : 'Belum diatur'}</Badge>
                  {row.source === 'ENV' && <Badge tone="info">dari .env</Badge>}
                </p>
                <p className="mt-0.5 text-caption text-ink-subtle">
                  Model: {row.model}
                  {row.keyHint && ` · Key: ${row.keyHint}`}
                  {row.updatedAt && ` · diubah ${formatDateTime(row.updatedAt)}`}
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setProvider(row.provider)}>
                Atur
              </Button>
              {row.source === 'DB' && (
                <Button size="icon" variant="ghost" aria-label={`Hapus key ${AGENT_PROVIDER_LABEL[row.provider]}`} onClick={() => setConfirmDelete(row.provider)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-4 grid gap-4 border-t border-line-subtle pt-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) save.mutate();
        }}
      >
        <Field label="Penyedia">
          {(id) => (
            <Select id={id} value={provider} onChange={(e) => setProvider(e.target.value as AgentProviderName)}>
              {AGENT_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {AGENT_PROVIDER_LABEL[p]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Model default" hint="Dipakai saat anggota memilih penyedia ini. Model bisa diubah per asisten.">
          {(id) => <Input id={id} value={model} onChange={(e) => setModel(e.target.value)} placeholder="mis. gpt-4o-mini" maxLength={100} />}
        </Field>
        <Field
          label="API key"
          className="sm:col-span-2"
          hint={keyHint}
        >
          {(id) => (
            <Input
              id={id}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={selected?.configured ? '••••••••  (tidak diubah)' : 'Tempel API key penyedia'}
              maxLength={500}
            />
          )}
        </Field>
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          <Button type="submit" loading={save.isPending} disabled={!canSave}>
            Simpan penyedia
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Hapus API key?"
        description={confirmDelete ? `${AGENT_PROVIDER_LABEL[confirmDelete]} tidak akan bisa dipakai sampai key baru dimasukkan. Key dari .env (jika ada) tetap berlaku.` : undefined}
        confirmLabel="Hapus key"
        destructive
        loading={remove.isPending}
        onConfirm={() => confirmDelete && remove.mutate(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
      />
    </SettingsCard>
  );
}

function PersonalCard() {
  const { data } = useAgentStatus();
  const update = useUpdatePersonalAgent();
  const personal = data!.personal;
  const [provider, setProvider] = useState<AgentProviderName>(personal?.provider ?? data!.providers[0]!.provider);
  const [model, setModel] = useState(personal?.model ?? data!.providers[0]!.defaultModel);
  const [budget, setBudget] = useState(String(personal?.monthlyBudgetUsd ?? 5));
  const [perms, setPerms] = useState<AgentPermissionName[]>(personal?.delegatedPermissions ?? [...AGENT_PERMISSIONS]);

  useEffect(() => {
    if (!personal) return;
    setProvider(personal.provider);
    setModel(personal.model);
    setBudget(String(personal.monthlyBudgetUsd));
    setPerms(personal.delegatedPermissions);
  }, [personal]);

  const onProvider = (next: AgentProviderName) => {
    setProvider(next);
    setModel(data!.providers.find((p) => p.provider === next)?.defaultModel ?? '');
  };
  const spent = personal?.spentThisMonthUsd ?? 0;
  const limit = Number(budget) || 0;
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 100;

  const save = () =>
    update.mutate(
      { provider, model: model.trim(), monthlyBudgetUsd: Number(budget) || 0, delegatedPermissions: perms },
      { onSuccess: () => toast.success('Pengaturan asisten disimpan.') },
    );

  return (
    <SettingsCard
      title="Asisten pribadi"
      description="Asisten hanya bisa melakukan hal yang boleh Anda lakukan, dan tidak lebih dari izin yang Anda berikan di bawah. Mencabut akses Anda ke sebuah proyek langsung berlaku untuknya."
      actions={
        <label className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
          {personal?.isActive ? 'Aktif' : 'Nonaktif'}
          <Toggle label="Aktifkan asisten" checked={Boolean(personal?.isActive)} onChange={(isActive) => update.mutate({ isActive })} />
        </label>
      }
      footer={
        <Button loading={update.isPending} onClick={save}>
          Simpan
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Penyedia LLM">
          {(id) => (
            <Select id={id} value={provider} onChange={(e) => onProvider(e.target.value as AgentProviderName)}>
              {data!.providers.map((p) => (
                <option key={p.provider} value={p.provider}>
                  {AGENT_PROVIDER_LABEL[p.provider]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Model" hint="Nama model sesuai dokumentasi penyedia.">
          {(id) => <Input id={id} value={model} onChange={(e) => setModel(e.target.value)} />}
        </Field>
        <Field label="Budget bulanan (US$)" hint="Agent berhenti bekerja saat budget habis.">
          {(id) => <Input id={id} type="number" min={0} max={1000} step={0.5} value={budget} onChange={(e) => setBudget(e.target.value)} />}
        </Field>
        <div className="flex flex-col justify-end pb-1.5">
          <p className="mb-1.5 text-[0.8125rem] text-ink-muted">
            Terpakai bulan ini (perkiraan): <span className="font-semibold tabular-nums text-ink">US$ {spent.toFixed(4)}</span>
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-canvas-deep" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className={clsx('h-full rounded-full', pct >= 80 ? 'bg-danger' : 'bg-brand')} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      <fieldset className="mt-5">
        <legend className="mb-2 text-[0.8125rem] font-semibold text-ink">Izin yang saya berikan</legend>
        <div className="space-y-2">
          {AGENT_PERMISSIONS.map((p) => (
            <label key={p} className="flex cursor-pointer items-start gap-2.5 text-[0.875rem] text-ink-muted">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-brand"
                checked={perms.includes(p)}
                onChange={(e) => setPerms((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))}
              />
              {AGENT_PERMISSION_LABEL[p]}
            </label>
          ))}
        </div>
      </fieldset>
    </SettingsCard>
  );
}

function MemoryCard() {
  const qc = useQueryClient();
  const memories = useQuery({ queryKey: agentKeys.memories, queryFn: api.agents.memories });
  const [text, setText] = useState('');
  const refresh = () => void qc.invalidateQueries({ queryKey: agentKeys.memories });
  const add = useMutation({
    mutationFn: () => api.agents.createMemory({ content: text, scope: 'USER' }),
    onSuccess: () => {
      setText('');
      refresh();
    },
    onError: (e) => toastError(e, 'Memori ditolak.'),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.agents.deleteMemory(id), onSuccess: refresh, onError: (e) => toastError(e) });
  const decide = useMutation({ mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api.agents.approveMemory(id, approve), onSuccess: refresh, onError: (e) => toastError(e) });

  const SCOPE = { USER: 'Pribadi', PROJECT: 'Proyek', DIVISION: 'Divisi', ORG: 'Organisasi' } as const;
  return (
    <SettingsCard title="Memori" description="Fakta singkat yang diingat asisten. Rahasia, kata sandi, nomor kartu, dan instruksi untuk agent otomatis ditolak.">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) add.mutate();
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Mis. Rapat tim Marketing setiap Senin pagi" aria-label="Memori baru" />
        <Button type="submit" loading={add.isPending} disabled={!text.trim()}>
          Simpan
        </Button>
      </form>
      <ul className="mt-4 divide-y divide-line-subtle">
        {(memories.data ?? []).map((m) => (
          <li key={m.id} className="flex items-start gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] text-ink">{m.content}</p>
              <p className="mt-0.5 text-caption text-ink-subtle">
                {SCOPE[m.scope]} · {m.source === 'AGENT_PROPOSED' ? 'diusulkan agent' : 'manual'}
                {m.status === 'PROPOSED' && <span className="ml-1.5 font-medium text-warning-ink">menunggu persetujuan</span>}
              </p>
            </div>
            {m.status === 'PROPOSED' && (
              <>
                <Button size="icon" variant="ghost" aria-label="Setujui" onClick={() => decide.mutate({ id: m.id, approve: true })}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label="Tolak" onClick={() => decide.mutate({ id: m.id, approve: false })}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button size="icon" variant="ghost" aria-label="Hapus memori" onClick={() => remove.mutate(m.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
        {memories.data?.length === 0 && <li className="py-6 text-center text-[0.875rem] text-ink-subtle">Belum ada memori.</li>}
      </ul>
    </SettingsCard>
  );
}

function SchedulesCard() {
  const qc = useQueryClient();
  const schedules = useQuery({ queryKey: agentKeys.schedules, queryFn: api.agents.schedules });
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<SchedulePreviewDTO | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: agentKeys.schedules });

  const parse = useMutation({ mutationFn: () => api.agents.previewSchedule(text), onSuccess: setPreview, onError: (e) => toastError(e, 'Jadwal tidak bisa dipahami.') });
  const confirm = useMutation({
    mutationFn: () => api.agents.confirmSchedule({ naturalText: text, cronExpr: preview!.cronExpr, timezone: preview!.timezone, instruction: preview!.instruction }),
    onSuccess: () => {
      toast.success('Jadwal disimpan.');
      setPreview(null);
      setText('');
      refresh();
    },
    onError: (e) => toastError(e),
  });
  const toggle = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.agents.setScheduleActive(id, isActive), onSuccess: refresh, onError: (e) => toastError(e) });
  const remove = useMutation({ mutationFn: (id: string) => api.agents.deleteSchedule(id), onSuccess: refresh, onError: (e) => toastError(e) });

  return (
    <SettingsCard title="Tugas terjadwal" description="Tulis dengan bahasa biasa. Anda akan melihat jadwalnya dulu dan harus mengonfirmasi sebelum disimpan. Minimal 1 jam antar eksekusi.">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim().length >= 3) parse.mutate();
        }}
      >
        <Input value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} maxLength={500} placeholder="Setiap Senin jam 8 pagi ringkas progres proyek saya" aria-label="Jadwal baru" />
        <Button type="submit" variant="secondary" loading={parse.isPending} disabled={text.trim().length < 3}>
          Pratinjau
        </Button>
      </form>

      {preview && (
        <div className="mt-3 rounded-xl border border-brand-border bg-brand-soft p-4">
          <p className="text-[0.875rem] font-semibold text-ink">{preview.humanText}</p>
          <p className="mt-1 text-[0.8125rem] text-ink-muted">Tugas: {preview.instruction}</p>
          <p className="mt-2 text-caption text-ink-subtle">Berjalan berikutnya ({preview.timezone}):</p>
          <ul className="text-[0.8125rem] text-ink-muted">
            {preview.next.map((d) => (
              <li key={d}>{formatDateTime(d)}</li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate()}>
              Ya, simpan jadwal
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPreview(null)}>
              Batal
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-4 divide-y divide-line-subtle">
        {(schedules.data ?? []).map((s) => (
          <li key={s.id} className="flex items-start gap-3 py-2.5">
            <CalendarClock className={clsx('mt-0.5 h-4 w-4 shrink-0', s.isActive ? 'text-brand' : 'text-ink-subtle')} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.875rem] font-medium text-ink">{s.humanText}</p>
              <p className="truncate text-[0.8125rem] text-ink-muted">{s.instruction}</p>
              <p className="text-caption text-ink-subtle">
                {s.isActive ? (s.nextRunAt ? `Berikutnya ${formatDateTime(s.nextRunAt)}` : '') : 'Dijeda'}
                {s.lastRunAt && ` · terakhir ${formatDateTime(s.lastRunAt)}`}
              </p>
            </div>
            <Button size="icon" variant="ghost" aria-label={s.isActive ? 'Jeda' : 'Lanjutkan'} onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })}>
              {s.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="ghost" aria-label="Hapus jadwal" onClick={() => remove.mutate(s.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
        {schedules.data?.length === 0 && <li className="py-6 text-center text-[0.875rem] text-ink-subtle">Belum ada jadwal.</li>}
      </ul>
    </SettingsCard>
  );
}
