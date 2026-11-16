import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { emailOnlySchema, resetPasswordSchema } from '@nexus/shared';
import { toast } from 'sonner';
import { Button, Field, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { AuthLayout, FormError, FormSuccess } from './AuthLayout';
import { useZodForm } from './useForm';

const backToLogin = (
  <Link to="/login" className="font-medium text-brand hover:underline">
    Kembali ke halaman masuk
  </Link>
);

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const form = useZodForm(emailOnlySchema, { email: '' }, async ({ email }) => {
    await api.auth.forgotPassword(email);
    setSent(true);
  });

  return (
    <AuthLayout
      title="Lupa kata sandi"
      description="Masukkan email akun Anda. Kami akan mengirim tautan untuk mengatur ulang kata sandi."
      footer={backToLogin}
    >
      {sent ? (
        <FormSuccess>
          Jika email tersebut terdaftar, tautan reset telah dikirim. Tautan berlaku selama 1 jam.
        </FormSuccess>
      ) : (
        <form className="space-y-4" onSubmit={form.onSubmit} noValidate>
          <FormError message={form.formError} />
          <Field label="Email" error={form.errors.email}>
            {(id) => (
              <Input
                id={id}
                type="email"
                autoFocus
                value={form.values.email}
                onChange={(e) => form.set('email', e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" className="w-full justify-center" loading={form.submitting}>
            Kirim tautan reset
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';
  const form = useZodForm(resetPasswordSchema, { token, password: '' }, async (values) => {
    await api.auth.resetPassword(values.token, values.password);
    toast.success('Kata sandi berhasil diubah. Silakan masuk.');
    navigate('/login', { replace: true });
  });

  return (
    <AuthLayout title="Atur ulang kata sandi" footer={backToLogin}>
      {!token ? (
        <FormError message="Tautan tidak valid. Minta tautan reset yang baru." />
      ) : (
        <form className="space-y-4" onSubmit={form.onSubmit} noValidate>
          <FormError message={form.formError ?? form.errors.token ?? null} />
          <Field label="Kata sandi baru" error={form.errors.password} hint="Minimal 8 karakter.">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                autoFocus
                value={form.values.password}
                onChange={(e) => form.set('password', e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" className="w-full justify-center" loading={form.submitting}>
            Simpan kata sandi
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
