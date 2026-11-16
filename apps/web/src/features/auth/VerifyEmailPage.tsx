import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { AuthLayout, FormError, FormSuccess } from './AuthLayout';

type State = { kind: 'loading' } | { kind: 'done' } | { kind: 'error'; message: string };

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against React StrictMode's double effect.
    if (started.current) return;
    started.current = true;
    if (!token) {
      setState({ kind: 'error', message: 'Tautan verifikasi tidak valid.' });
      return;
    }
    api.auth
      .verifyEmail(token)
      .then(() => setState({ kind: 'done' }))
      .catch((error: unknown) => setState({ kind: 'error', message: errorMessage(error) }));
  }, [token]);

  return (
    <AuthLayout
      title="Verifikasi email"
      footer={
        <Link to="/login" className="font-medium text-brand hover:underline">
          Ke halaman masuk
        </Link>
      }
    >
      {state.kind === 'loading' && (
        <div className="flex items-center gap-2 text-ink-muted">
          <Spinner className="h-4 w-4" /> Memverifikasi…
        </div>
      )}
      {state.kind === 'done' && <FormSuccess>Email berhasil diverifikasi. Anda sekarang bisa masuk.</FormSuccess>}
      {state.kind === 'error' && <FormError message={state.message} />}
    </AuthLayout>
  );
}
