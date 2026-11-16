import type { ReactNode } from 'react';
import clsx from 'clsx';

/** White settings panel in the board/Kanban style: title row, body, optional action footer. */
export function SettingsCard({
  title,
  description,
  actions,
  footer,
  children,
  className,
  bodyClassName = 'px-6 py-5',
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Right side of the title row. */
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={clsx('rounded-2xl bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-inset ring-line-subtle', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle px-6 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-bold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-[0.8125rem] text-ink-subtle">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children && <div className={bodyClassName}>{children}</div>}
      {footer && (
        <footer className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-line-subtle bg-canvas/70 px-6 py-3.5">
          {footer}
        </footer>
      )}
    </section>
  );
}
