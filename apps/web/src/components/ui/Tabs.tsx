import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Underline tabs (DESIGN 5.1: active = blue text + indicator). */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={clsx('flex gap-1 border-b border-line', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={clsx(
              '-mb-px border-b-2 px-3 py-2 text-body font-medium transition-colors',
              active ? 'border-brand text-brand' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="ml-1.5 rounded-full bg-canvas-deep px-1.5 text-caption text-ink-muted">
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Pill segmented control, used for view toggles (Board | Tabel). */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5" role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          onClick={() => onChange(item.value)}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-body font-medium [&>svg]:h-3.5 [&>svg]:w-3.5',
            item.value === value ? 'bg-surface text-brand shadow-card' : 'text-ink-muted hover:text-ink',
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
