import type { ReactNode } from 'react';
import clsx from 'clsx';

/** CSS-only tooltip; shown on hover and keyboard focus. */
export function Tooltip({
  content,
  children,
  side = 'bottom',
}: {
  content: ReactNode;
  children: ReactNode;
  side?: 'bottom' | 'right';
}) {
  return (
    <span className="group/tooltip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={clsx(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-caption font-medium text-white dark:bg-line-strong dark:text-ink opacity-0 transition-opacity',
          'group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100',
          side === 'bottom' ? 'left-1/2 top-full mt-1.5 -translate-x-1/2' : 'left-full top-1/2 ml-2 -translate-y-1/2',
        )}
      >
        {content}
      </span>
    </span>
  );
}
