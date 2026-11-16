import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';

interface MenuProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  /** `below` (default) drops down; `side-start`/`side-end` open to the right, aligned top/bottom (icon rail). */
  placement?: 'below' | 'side-start' | 'side-end';
  className?: string;
}

const PLACEMENT = {
  below: { left: 'left-0 top-full mt-1.5', right: 'right-0 top-full mt-1.5' },
  'side-start': { left: 'left-full top-0 ml-3', right: 'left-full top-0 ml-3' },
  'side-end': { left: 'left-full bottom-0 ml-3', right: 'left-full bottom-0 ml-3' },
} as const;

/** Click-to-open popover menu. Closes on outside click and Escape. */
export function Menu({ trigger, children, align = 'right', placement = 'below', className }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          role="menu"
          className={clsx(
            'absolute z-40 min-w-[180px] rounded-xl border border-line bg-surface p-1 shadow-card-hover',
            PLACEMENT[placement][align],
            className,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onSelect,
  icon,
  children,
  danger,
  disabled,
}: {
  onSelect: () => void;
  icon?: ReactNode;
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={clsx(
        'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body font-medium disabled:opacity-50',
        danger ? 'text-danger-ink hover:bg-danger-soft' : 'text-ink hover:bg-canvas-deep',
      )}
    >
      {icon && <span className="text-ink-subtle [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-line-subtle" />;
}
