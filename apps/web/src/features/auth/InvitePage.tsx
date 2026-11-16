import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ORG_ROLE_LABEL, acceptInvitationSchema, type InvitationPreview } from '@nexus/shared';
import { Badge, Button, Field, Input, PageSpinner } from '../../components/ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { AuthLayout, FormError, FormSuccess } from './AuthLayout';
import { useCompleteLogin } from './hooks';
import { useZodForm } from './useForm';

export function InvitePage() {
  const { token = '' } = useParams();
  const preview = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => api.invitations.preview(token),
    retry: false,
  });

  if (preview.isPending) return <PageSpinner />;
  if (preview.isError) {
    return (
      <AuthLayout title="Undangan tidak valid">
        <FormError message={errorMessage(preview.error, 'Undangan sudah kedaluwarsa atau dicabut.')} />
      </AuthLayout>
    );
  }
  return <AcceptForm token={token} invitation={preview.data} />;
}

function AcceptForm({ token, invitation }: { token: string; invitation: InvitationPreview }) {
  const completeLogin = useCompleteLogin();
  const [needsVerification, setNeedsVerification] = useState(false);
  const isLinkInvite = invitation.email === null;

  const form = useZodForm(
    acceptInvitationSchema,
    { name: '', password: '', email: invitation.email ?? '' },
    async (values) => {
      const result = await api.invitations.accept(token, {
        name: values.name,
        password: values.password,
        email: isLinkInvite ? values.email : undefined,
      });
      if (result.auth) completeLogin(result.auth);
      else setNeedsVerification(result.requiresVerification);
    },
  );

  return (
    <AuthLayout
      title={`Gabung ke ${invitation.organizationName}`}
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          Anda diundang sebagai <Badge tone="brand">{ORG_ROLE_LABEL[invitation.role]}</Badge>
          {invitation.divisionName && <>di divisi <strong>{invitation.divisionName}</strong></>}
        </span>
      }
      footer={<>Undangan berlaku hingga {formatDateTime(invitation.expiresAt)}</>}
    >
      {needsVerification ? (
        <FormSuccess>
          Akun berhasil dibuat. Cek email Anda dan klik tautan verifikasi sebelum masuk.
        </FormSuccess>
      ) : (
        <form className="space-y-4" onSubmit={form.onSubmit} noValidate>
          <FormError message={form.formError} />
          <Field label="Email" error={form.errors.email}>
            {(id) => (
              <Input
                id={id}
                type="email"
                disabled={!isLinkInvite}
                value={form.values.email}
                onChange={(e) => form.set('email', e.target.value)}
              />
            )}
          </Field>
          <Field label="Nama lengkap" error={form.errors.name}>
            {(id) => (
              <Input id={id} autoFocus value={form.values.name} onChange={(e) => form.set('name', e.target.value)} />
            )}
          </Field>
          <Field label="Kata sandi" error={form.errors.password} hint="Minimal 8 karakter.">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete="new-password"
                value={form.values.password}
                onChange={(e) => form.set('password', e.target.value)}
              />
            )}
          </Field>
          <Button type="submit" className="w-full justify-center" loading={form.submitting}>
            Terima undangan
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
