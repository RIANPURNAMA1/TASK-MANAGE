import type { ReactNode } from 'react';
import clsx from 'clsx';

const PILL_TONES = {
  success: 'bg-success-soft text-success-ink [&>i]:bg-success',
  warning: 'bg-warning-soft text-warning-ink [&>i]:bg-warning',
  danger: 'bg-danger-soft text-danger-ink [&>i]:bg-danger',
  info: 'bg-brand-subtle text-brand-strong [&>i]:bg-brand',
  neutral: 'bg-canvas-deep text-ink-muted [&>i]:bg-ink-subtle',
} as const;

/** Status pill with a leading dot, shared by the admin tables. */
export function StatusPill({ tone, children }: { tone: keyof typeof PILL_TONES; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-caption font-bold', PILL_TONES[tone])}>
      <i className="h-1.5 w-1.5 rounded-full" aria-hidden />
      {children}
    </span>
  );
}

/** Rounded white surface used by the admin sections (matches board/table view). */
export const ADMIN_SURFACE = 'rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle';
