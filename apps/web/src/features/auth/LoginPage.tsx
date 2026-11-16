import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { loginSchema } from '@nexus/shared';
import { ApiError } from '@nexus/api-client';
import { platform } from '@nexus/platform';
import { toast } from 'sonner';
import { Button, Field, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { AuthSplitLayout, FormError } from './AuthLayout';
import { AuthShowcase } from './AuthShowcase';
import { useCompleteLogin, useMetaQuery } from './hooks';
import { useZodForm } from './useForm';

const GOOGLE_ERRORS: Record<string, string> = {
  not_invited: 'Akun Google ini belum terdaftar. Minta undangan dari admin organisasi Anda.',
  deactivated: 'Akun Anda telah dinonaktifkan.',
  state_mismatch: 'Sesi login kedaluwarsa. Silakan coba lagi.',
  unverified_email: 'Email akun Google ini belum terverifikasi.',
  timeout: 'Login Google tidak diselesaikan dalam 5 menit. Silakan coba lagi.',
};

export function LoginPage() {
  const { data: meta } = useMetaQuery();
  const location = useLocation();
  const completeLogin = useCompleteLogin();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [googleWaiting, setGoogleWaiting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const form = useZodForm(loginSchema, { email: '', password: '' }, async (values) => {
    try {
      completeLogin(await api.auth.login(values), redirectTo);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        setUnverifiedEmail(values.email);
      }
      throw error;
    }
  });

  /** Web: full-page redirect. Desktop: system browser + taskapp:// deep link with PKCE. */
  const signInWithGoogle = async () => {
    if (!platform.googleSignIn) {
      window.location.assign(api.auth.googleStartUrl());
      return;
    }
    setGoogleWaiting(true);
    try {
      const { code, verifier } = await platform.googleSignIn((pkce) => api.auth.googleStartUrl(pkce));
      completeLogin(await api.auth.googleDesktopExchange({ code, verifier }), redirectTo);
    } catch (error) {
      const reason = error instanceof Error ? error.message : '';
      toast.error(GOOGLE_ERRORS[reason] ?? (error instanceof ApiError ? error.message : 'Login Google gagal. Silakan coba lagi.'));
    } finally {
      setGoogleWaiting(false);
    }
  };

  const resend = async () => {
    if (!unverifiedEmail) return;
    await api.auth.resendVerification(unverifiedEmail).catch(() => undefined);
    toast.success('Email verifikasi telah dikirim ulang.');
  };

  return (
    <AuthSplitLayout
      title="Selamat datang kembali"
      description="Masuk untuk melanjutkan ke ruang kerja tim Anda."
      aside={<AuthShowcase />}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Mendunia Workbase</span>
          <span>Belum punya akun? Minta undangan dari admin organisasi.</span>
        </div>
      }
    >
      {meta?.googleEnabled && (
        <>
          <Button
            variant="secondary"
            className="h-10 w-full justify-center shadow-card"
            onClick={() => void signInWithGoogle()}
            loading={googleWaiting}
            icon={<GoogleIcon />}
          >
            {googleWaiting ? 'Lanjutkan di browser…' : 'Masuk dengan Google'}
          </Button>
          {googleWaiting && (
            <p className="mt-2 text-center text-caption text-ink-subtle">
              Selesaikan login di browser, lalu kembali ke aplikasi.{' '}
              <button type="button" className="font-medium text-brand hover:underline" onClick={() => setGoogleWaiting(false)}>
                Batal
              </button>
            </p>
          )}
          <div className="my-6 flex items-center gap-3 text-caption text-ink-subtle">
            <span className="h-px flex-1 bg-line" /> atau masuk dengan email <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form className="space-y-4" onSubmit={form.onSubmit} noValidate>
        <FormError message={form.formError} />
        {unverifiedEmail && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-body text-warning-ink">
            <span>Email belum terverifikasi.</span>
            <button type="button" onClick={resend} className="shrink-0 font-medium underline-offset-2 hover:underline">
              Kirim ulang
            </button>
          </div>
        )}
        <Field label="Email" error={form.errors.email}>
          {(id) => (
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <Input
                id={id}
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="nama@perusahaan.com"
                className="h-10 pl-9"
                aria-invalid={Boolean(form.errors.email)}
                value={form.values.email}
                onChange={(e) => form.set('email', e.target.value)}
              />
            </div>
          )}
        </Field>
        <Field label="Kata sandi" error={form.errors.password}>
          {(id) => (
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" />
              <Input
                id={id}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Masukkan kata sandi"
                className="h-10 pl-9 pr-10"
                aria-invalid={Boolean(form.errors.password)}
                value={form.values.password}
                onChange={(e) => form.set('password', e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-ink-subtle hover:bg-canvas-deep hover:text-ink"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-body font-medium text-brand hover:underline">
            Lupa kata sandi?
          </Link>
        </div>
        <Button type="submit" className="h-10 w-full justify-center" loading={form.submitting}>
          Masuk
        </Button>
      </form>
    </AuthSplitLayout>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.2 14.6 2.2 12 2.2 6.6 2.2 2.3 6.6 2.3 12s4.3 9.8 9.7 9.8c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6H12z" />
    </svg>
  );
}
