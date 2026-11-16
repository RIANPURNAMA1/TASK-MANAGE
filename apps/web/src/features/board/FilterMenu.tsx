import type { ReactNode } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown, X } from 'lucide-react';
import { Menu } from '../../components/ui';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  leading?: ReactNode;
}

/**
 * Compact filter button: shows "Label" when unset and "Label: value" (highlighted) when
 * set, with an inline clear button. Replaces native selects for a calmer toolbar.
 */
export function FilterMenu<T extends string>({
  label,
  icon,
  value,
  emptyValue,
  options,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  value: T;
  emptyValue: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}) {
  const active = value !== emptyValue;
  const selected = options.find((o) => o.value === value);

  return (
    <Menu
      align="left"
      className="max-h-80 w-56 overflow-y-auto"
      trigger={({ open, toggle }) => (
        <div
          className={clsx(
            'inline-flex h-8 items-center rounded-lg border text-body font-semibold transition-colors',
            active
              ? 'border-brand-border bg-brand-subtle text-brand-strong'
              : clsx('border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink', open && 'border-line-strong text-ink'),
          )}
        >
          <button
            type="button"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            className="inline-flex h-full items-center gap-1.5 pl-2.5 pr-2 [&>svg]:h-3.5 [&>svg]:w-3.5"
          >
            {icon}
            <span className="whitespace-nowrap">
              {label}
              {active && selected && <span className="font-medium">: {selected.label}</span>}
            </span>
            {!active && <ChevronDown className="opacity-60" />}
          </button>
          {active && (
            <button
              type="button"
              aria-label={`Hapus filter ${label}`}
              onClick={() => onChange(emptyValue)}
              className="mr-1 rounded-md p-0.5 hover:bg-brand-border/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    >
      {(close) =>
        options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="menuitemradio"
            aria-checked={option.value === value}
            onClick={() => {
              onChange(option.value);
              close();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-body font-medium text-ink hover:bg-canvas-deep"
          >
            {option.leading}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.value === value && <Check className="h-4 w-4 shrink-0 text-brand" />}
          </button>
        ))
      }
    </Menu>
  );
}
