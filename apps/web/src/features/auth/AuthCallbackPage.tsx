import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { PageSpinner } from '../../components/ui';
import { api } from '../../lib/api';
import { AuthLayout, FormError } from './AuthLayout';

const ERRORS: Record<string, string> = {
  not_invited: 'Akun Google ini belum terdaftar. Minta undangan dari admin organisasi Anda.',
  deactivated: 'Akun Anda telah dinonaktifkan.',
  state_mismatch: 'Sesi login kedaluwarsa. Silakan coba lagi.',
  unverified_email: 'Email akun Google ini belum terverifikasi.',
};

/** Landing page after the Google SSO redirect: the API already set the refresh cookie. */
export function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const error = params.get('error');
  const started = useRef(false);

  useEffect(() => {
    if (error || started.current) return;
    started.current = true;
    api.auth
      .refresh()
      .then((auth) => navigate(auth ? '/dashboard' : '/login?error=sso', { replace: true }))
      .catch(() => navigate('/login', { replace: true }));
  }, [error, navigate]);

  if (!error) return <PageSpinner />;

  return (
    <AuthLayout
      title="Gagal masuk"
      footer={
        <Link to="/login" className="font-medium text-brand hover:underline">
          Kembali ke halaman masuk
        </Link>
      }
    >
      <FormError message={ERRORS[error] ?? 'Login dengan Google gagal. Silakan coba lagi.'} />
    </AuthLayout>
  );
}
