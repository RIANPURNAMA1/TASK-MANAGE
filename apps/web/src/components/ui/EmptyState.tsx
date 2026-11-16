import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { errorMessage } from '../../lib/errors';
import { Button } from './Button';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-subtle text-brand [&>svg]:h-5 [&>svg]:w-5">
          {icon}
        </div>
      )}
      <h3 className="text-h3 text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-body text-ink-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <EmptyState
      icon={<AlertTriangle />}
      title="Gagal memuat data"
      description={errorMessage(error)}
      action={
        onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Coba lagi
          </Button>
        )
      }
    />
  );
}
