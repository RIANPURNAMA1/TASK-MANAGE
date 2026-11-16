import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { AppWindow, Bell, BellRing, Building2, Camera, Download, Info, KeyRound, Lock, Mail, Monitor, MonitorSmartphone, Moon, Palette, Power, RefreshCw, ShieldCheck, Sun, Trash2, Upload, User } from 'lucide-react';
import { toast } from 'sonner';
import {
  EMAIL_DIGEST_LABEL,
  EMAIL_DIGEST_MODES,
  ORG_ROLE_LABEL,
  changePasswordSchema,
  type EmailDigestMode,
} from '@nexus/shared';
import { platform } from '@nexus/platform';
import { Avatar, Button, Field, Input, Spinner, Toggle } from '../../components/ui';
import { errorMessage } from '../../lib/errors';
import { useCurrentUser } from '../../stores/auth';
import { useThemeStore, type ThemeMode } from '../../stores/theme';
import { useDesktopUpdate } from '../desktop/useDesktopUpdate';
import { useAvatarMutations, useChangePassword, useUpdateMe } from './hooks';
import { SessionsSection } from './SessionsSection';
import { SettingsCard } from './SettingsCard';

type Section = 'profile' | 'security' | 'sessions' | 'notifications' | 'appearance' | 'app';

const SECTIONS: { value: Section; label: string; icon: ReactNode }[] = [
  { value: 'profile', label: 'Profil', icon: <User /> },
  { value: 'security', label: 'Keamanan', icon: <ShieldCheck /> },
  { value: 'sessions', label: 'Sesi Aktif', icon: <MonitorSmartphone /> },
  { value: 'notifications', label: 'Notifikasi', icon: <Bell /> },
  { value: 'appearance', label: 'Tampilan', icon: <Palette /> },
  // Desktop only (PRD §4): version, signed auto-update, launch at login.
  ...(platform.kind === 'desktop' ? [{ value: 'app' as const, label: 'Aplikasi', icon: <AppWindow /> }] : []),
];

const isSection = (v: string | null): v is Section => SECTIONS.some((s) => s.value === v);

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab');
  const section: Section = isSection(tab) ? tab : 'profile';

  const select = (next: Section) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'profile') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );

  return (
    <div className="flex min-h-full flex-col bg-paper">
      <header className="border-b border-line bg-surface px-8 pt-7">
        <h1 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-ink">Pengaturan akun</h1>
        <p className="mt-1.5 text-[0.875rem] text-ink-muted">Kelola profil, keamanan, dan preferensi notifikasi Anda.</p>
        <nav aria-label="Bagian pengaturan" role="tablist" className="-mb-px mt-5 flex items-center gap-7 overflow-x-auto">
          {SECTIONS.map((s) => {
            const active = s.value === section;
            return (
              <button
                key={s.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => select(s.value)}
                className={clsx(
                  'relative inline-flex shrink-0 items-center gap-2 pb-3.5 text-[0.875rem] transition-colors [&>svg]:h-4 [&>svg]:w-4',
                  "after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:content-['']",
                  active ? 'font-semibold text-ink after:bg-brand' : 'font-medium text-ink-muted after:bg-transparent hover:text-ink',
                )}
              >
                {s.icon}
                {s.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 px-8 py-8">
        <div className="max-w-3xl space-y-5">
          {section === 'profile' && <ProfileSection />}
          {section === 'security' && <SecuritySection />}
          {section === 'sessions' && <SessionsSection />}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'appearance' && <AppearanceSection />}
          {section === 'app' && <DesktopAppSection />}
        </div>
      </div>
    </div>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────

function ProfileSection() {
  return (
    <>
      <PhotoCard />
      <ProfileInfoCard />
    </>
  );
}

function PhotoCard() {
  const user = useCurrentUser();
  const { upload, remove } = useAvatarMutations();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = upload.isPending || remove.isPending;

  // Release the local preview once it is no longer shown.
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const start = (file: File | undefined) => {
    if (!file || busy) return;
    if (!file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar (JPG, PNG, atau WebP).');
      return;
    }
    setPreview(URL.createObjectURL(file));
    upload.mutate(file, { onSettled: () => setPreview(null) });
  };

  const drop = {
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      start(e.dataTransfer.files[0]);
    },
  };

  const shown = preview ? { ...user, avatarUrl: preview } : user;

  return (
    <SettingsCard title="Foto profil" description="Tampil di kartu tugas, komentar, dan chat tim.">
      <div
        {...drop}
        className={clsx(
          '-m-2 flex flex-wrap items-center gap-6 rounded-2xl p-2 transition-colors',
          dragging && 'bg-brand-soft outline-dashed outline-2 outline-brand-border',
        )}
      >
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label="Ganti foto profil"
          className="group relative shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Avatar user={shown} size="2xl" className="ring-4" />
          <span
            className={clsx(
              'absolute inset-0 flex items-center justify-center rounded-full bg-ink/45 text-white dark:bg-black/55 transition-opacity',
              busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
            )}
          >
            {busy ? <Spinner className="h-6 w-6 text-white" /> : <Camera className="h-6 w-6" />}
          </span>
          {!busy && (
            <span className="absolute bottom-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white shadow-card ring-[3px] ring-surface">
              <Camera className="h-4 w-4" />
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-semibold text-ink">
            {dragging ? 'Lepaskan untuk mengunggah' : 'Unggah foto baru'}
          </p>
          <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-ink-subtle">
            Klik foto atau seret gambar ke sini. JPG, PNG, atau WebP, maks. 10 MB. Foto otomatis dipotong persegi.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Upload className="h-4 w-4" />}
              loading={upload.isPending}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {user.avatarUrl ? 'Ganti foto' : 'Unggah foto'}
            </Button>
            {user.avatarUrl && (
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                loading={remove.isPending}
                disabled={busy}
                onClick={() => remove.mutate()}
                className="hover:!text-danger"
              >
                Hapus
              </Button>
            )}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          onChange={(e) => {
            start(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </SettingsCard>
  );
}

function ProfileInfoCard() {
  const user = useCurrentUser();
  const update = useUpdateMe();
  const [name, setName] = useState(user.name);
  const trimmed = name.trim();
  const dirty = trimmed !== user.name;
  const invalid = trimmed.length < 2;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (dirty && !invalid) update.mutate({ name: trimmed });
  };

  return (
    <form onSubmit={submit}>
      <SettingsCard
        title="Informasi pribadi"
        description="Nama Anda terlihat oleh semua anggota organisasi."
        footer={
          <>
            {dirty && (
              <Button variant="ghost" onClick={() => setName(user.name)} disabled={update.isPending}>
                Batal
              </Button>
            )}
            <Button type="submit" loading={update.isPending} disabled={!dirty || invalid}>
              Simpan perubahan
            </Button>
          </>
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Nama lengkap"
            className="sm:col-span-2"
            error={dirty && invalid ? 'Nama minimal 2 karakter.' : undefined}
          >
            {(id) => <Input id={id} value={name} autoComplete="name" maxLength={80} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label="Email" className="sm:col-span-2" hint="Email dipakai untuk masuk dan tidak dapat diubah.">
            {(id) => <ReadOnly id={id} icon={<Mail />} value={user.email} />}
          </Field>
          <Field label="Organisasi">{(id) => <ReadOnly id={id} icon={<Building2 />} value={user.organization.name} />}</Field>
          <Field label="Peran">{(id) => <ReadOnly id={id} icon={<ShieldCheck />} value={ORG_ROLE_LABEL[user.orgRole]} />}</Field>
        </div>
      </SettingsCard>
    </form>
  );
}

function ReadOnly({ id, icon, value }: { id: string; icon: ReactNode; value: string }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <Input id={id} value={value} readOnly className="cursor-default bg-canvas pl-9 text-ink-muted focus:ring-0" />
      <Lock className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle/70" aria-hidden />
    </div>
  );
}

// ─── Security ─────────────────────────────────────────────────────────

function SecuritySection() {
  const user = useCurrentUser();
  const change = useChangePassword();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!user.hasPassword) {
    return (
      <SettingsCard title="Kata sandi">
        <p className="flex items-start gap-3 text-[0.875rem] text-ink-muted">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-info-soft text-info-ink">
            <Info className="h-4 w-4" />
          </span>
          Akun Anda masuk menggunakan Google. Kata sandi dikelola melalui akun Google Anda.
        </p>
      </SettingsCard>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Data tidak valid');
    change.mutate(parsed.data, {
      onSuccess: () => {
        setCurrent('');
        setNew('');
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };

  return (
    <form onSubmit={submit}>
      <SettingsCard
        title="Ubah kata sandi"
        description="Setelah diubah, semua perangkat lain akan otomatis keluar."
        footer={
          <Button type="submit" icon={<KeyRound className="h-4 w-4" />} loading={change.isPending} disabled={!currentPassword || !newPassword}>
            Ubah kata sandi
          </Button>
        }
      >
        <div className="space-y-5">
          {error && (
            <p role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-2.5 text-[0.8125rem] text-danger-ink">
              {error}
            </p>
          )}
          <Field label="Kata sandi saat ini">
            {(id) => (
              <Input id={id} type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
            )}
          </Field>
          <Field label="Kata sandi baru" hint="Minimal 8 karakter. Gunakan kombinasi huruf, angka, dan simbol.">
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNew(e.target.value)} />}
          </Field>
        </div>
      </SettingsCard>
    </form>
  );
}

// ─── Notifications ────────────────────────────────────────────────────

// ─── Appearance ───────────────────────────────────────────────────────

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  { value: 'light', label: 'Terang', icon: <Sun /> },
  { value: 'dark', label: 'Gelap', icon: <Moon /> },
  { value: 'system', label: 'Ikuti sistem', icon: <Monitor /> },
];

function AppearanceSection() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  return (
    <SettingsCard title="Tema" description="Tersimpan di perangkat ini. “Ikuti sistem” mengikuti mode terang/gelap OS Anda.">
      <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Tema">
        {THEME_OPTIONS.map((opt) => {
          const checked = mode === opt.value;
          return (
            <label
              key={opt.value}
              className={clsx(
                'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[0.875rem] font-medium transition-colors [&>svg]:h-4 [&>svg]:w-4',
                checked ? 'border-brand bg-brand-soft text-ink ring-1 ring-brand' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              <input
                type="radio"
                name="theme"
                className="h-4 w-4 accent-brand"
                checked={checked}
                onChange={() => setMode(opt.value)}
              />
              {opt.icon}
              {opt.label}
            </label>
          );
        })}
      </div>
    </SettingsCard>
  );
}

function NotificationsSection() {
  const user = useCurrentUser();
  const update = useUpdateMe();
  const permissionQuery = useQuery({ queryKey: ['notification-permission'], queryFn: () => platform.notificationPermission() });
  const permission = permissionQuery.data ?? 'default';
  const label = platform.kind === 'desktop' ? 'Notifikasi desktop' : 'Notifikasi browser';

  const enableBrowser = async () => {
    const granted = await platform.requestNotificationPermission();
    await permissionQuery.refetch();
    if (granted) toast.success(`${label} aktif.`);
  };

  return (
    <>
      <SettingsCard title="Email" description="Kapan kami mengirim notifikasi ke email Anda.">
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Mode email">
          {EMAIL_DIGEST_MODES.map((mode: EmailDigestMode) => {
            const checked = user.emailDigest === mode;
            return (
              <label
                key={mode}
                className={clsx(
                  'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-[0.875rem] font-medium transition-colors',
                  checked ? 'border-brand bg-brand-soft text-ink ring-1 ring-brand' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
                )}
              >
                <input
                  type="radio"
                  name="emailDigest"
                  className="h-4 w-4 accent-brand"
                  checked={checked}
                  disabled={update.isPending}
                  onChange={() => update.mutate({ emailDigest: mode })}
                />
                {EMAIL_DIGEST_LABEL[mode]}
              </label>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-subtle text-brand">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink">
              {label}
              {permission === 'granted' && (
                <span className="inline-flex h-5 items-center gap-1 rounded-full bg-success-soft px-2 text-[11px] font-bold text-success-ink">
                  <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> Aktif
                </span>
              )}
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-ink-subtle">
              {permission === 'granted'
                ? platform.kind === 'desktop'
                  ? 'Notifikasi muncul di sistem operasi saat jendela tidak sedang dibuka, termasuk saat aplikasi di system tray.'
                  : 'Anda akan menerima notifikasi saat tab tidak sedang dibuka.'
                : permission === 'denied'
                  ? 'Diblokir. Ubah izin notifikasi untuk mengaktifkan.'
                  : permission === 'unsupported'
                    ? 'Browser ini tidak mendukung notifikasi.'
                    : 'Dapatkan notifikasi meski aplikasi sedang tidak dibuka.'}
            </p>
          </div>
          {permission === 'default' && (
            <Button size="sm" onClick={() => void enableBrowser()}>
              Aktifkan
            </Button>
          )}
        </div>
      </SettingsCard>
    </>
  );
}

// ─── Desktop app (PRD §4) ─────────────────────────────────────────────

function DesktopAppSection() {
  const version = useQuery({ queryKey: ['app-version'], queryFn: () => platform.appVersion(), staleTime: Infinity });
  const autostart = useQuery({ queryKey: ['autostart'], queryFn: () => platform.autostart!.isEnabled(), enabled: Boolean(platform.autostart) });
  const { status, update, progress, check, install } = useDesktopUpdate();
  const [savingAutostart, setSavingAutostart] = useState(false);

  const toggleAutostart = async (enabled: boolean) => {
    if (!platform.autostart) return;
    setSavingAutostart(true);
    try {
      await platform.autostart.setEnabled(enabled);
      await autostart.refetch();
      toast.success(enabled ? 'Mendunia Workbase akan berjalan saat komputer dinyalakan.' : 'Mulai otomatis dimatikan.');
    } catch {
      toast.error('Pengaturan mulai otomatis gagal disimpan.');
    } finally {
      setSavingAutostart(false);
    }
  };

  return (
    <>
      <SettingsCard title="Versi aplikasi" description="Pembaruan ditandatangani dan diverifikasi sebelum dipasang.">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white">
            <AppWindow className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-bold text-ink">Mendunia Workbase Desktop {version.data ?? '…'}</p>
            <p className="mt-0.5 text-[0.8125rem] text-ink-subtle">
              {status === 'checking'
                ? 'Memeriksa pembaruan…'
                : status === 'available' && update
                  ? `Versi ${update.version} tersedia.`
                  : status === 'installing'
                    ? `Mengunduh pembaruan${progress !== null ? ` · ${progress}%` : '…'} Aplikasi akan dimulai ulang.`
                    : status === 'up-to-date'
                      ? 'Anda memakai versi terbaru.'
                      : status === 'error'
                        ? 'Pemeriksaan pembaruan gagal.'
                        : 'Aplikasi memeriksa pembaruan otomatis setiap kali dibuka.'}
            </p>
          </div>
          {status === 'available' && update ? (
            <Button size="sm" icon={<Download className="h-4 w-4" />} onClick={() => void install()}>
              Pasang & mulai ulang
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<RefreshCw className="h-4 w-4" />}
              loading={status === 'checking'}
              disabled={status === 'installing'}
              onClick={() => void check()}
            >
              Periksa pembaruan
            </Button>
          )}
        </div>
        {update?.notes && status === 'available' && (
          <p className="mt-4 whitespace-pre-line rounded-xl bg-canvas px-4 py-3 text-[0.8125rem] text-ink-muted">{update.notes}</p>
        )}
      </SettingsCard>

      <SettingsCard>
        <div className="flex items-center gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-canvas-deep text-ink-muted">
            <Power className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.9375rem] font-bold text-ink">Jalankan saat komputer menyala</p>
            <p className="mt-0.5 text-[0.8125rem] text-ink-subtle">
              Mendunia Workbase terbuka di system tray agar notifikasi tetap masuk. Menutup jendela tidak menghentikan aplikasi.
            </p>
          </div>
          <Toggle
            checked={Boolean(autostart.data)}
            disabled={autostart.isPending || savingAutostart}
            onChange={(v) => void toggleAutostart(v)}
            label="Jalankan saat komputer menyala"
          />
        </div>
      </SettingsCard>
    </>
  );
}
