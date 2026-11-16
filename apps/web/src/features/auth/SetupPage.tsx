import { setupSchema } from '@nexus/shared';
import { Button, Field, Input } from '../../components/ui';
import { api } from '../../lib/api';
import { AuthLayout, FormError } from './AuthLayout';
import { useCompleteLogin } from './hooks';
import { useZodForm } from './useForm';

/** First-run: creates the organization and its Owner account. */
export function SetupPage() {
  const completeLogin = useCompleteLogin();
  const form = useZodForm(
    setupSchema,
    { orgName: '', name: '', email: '', password: '' },
    async (values) => completeLogin(await api.setup(values), '/divisions'),
  );

  const fields = [
    { key: 'orgName', label: 'Nama organisasi', type: 'text', autoComplete: 'organization' },
    { key: 'name', label: 'Nama Anda', type: 'text', autoComplete: 'name' },
    { key: 'email', label: 'Email', type: 'email', autoComplete: 'email' },
    { key: 'password', label: 'Kata sandi', type: 'password', autoComplete: 'new-password' },
  ] as const;

  return (
    <AuthLayout
      title="Siapkan NexusTask"
      description="Buat organisasi dan akun Owner pertama. Langkah ini hanya dilakukan sekali."
    >
      <form className="space-y-4" onSubmit={form.onSubmit} noValidate>
        <FormError message={form.formError} />
        {fields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            error={form.errors[f.key]}
            hint={f.key === 'password' ? 'Minimal 8 karakter.' : undefined}
          >
            {(id) => (
              <Input
                id={id}
                type={f.type}
                autoComplete={f.autoComplete}
                value={form.values[f.key]}
                onChange={(e) => form.set(f.key, e.target.value)}
              />
            )}
          </Field>
        ))}
        <Button type="submit" className="w-full justify-center" loading={form.submitting}>
          Buat organisasi
        </Button>
      </form>
    </AuthLayout>
  );
}
