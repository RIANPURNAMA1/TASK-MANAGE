import type { ReactNode } from 'react';
import clsx from 'clsx';

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<Tone, string> = {
  neutral: 'bg-canvas-deep text-ink-muted',
  brand: 'bg-brand-subtle text-brand-strong',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
  info: 'bg-info-soft text-info-ink',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-caption font-medium',
        '[&>svg]:h-3 [&>svg]:w-3',
        tones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** Label pill tinted with the label's own color (user-defined, so applied inline). */
export function LabelPill({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex max-w-[140px] items-center truncate rounded-full px-2 py-0.5 text-caption font-medium"
      style={{ backgroundColor: `${color}1F`, color }}
    >
      <span className="truncate brightness-75">#{name}</span>
    </span>
  );
}

export function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[11px] font-medium text-white ring-2 ring-surface">
      {count > 99 ? '99+' : count}
    </span>
  );
}
