import { useMemo, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import { Menu } from '../../components/ui';

interface Option {
  id: string;
  label: string;
  render?: ReactNode;
}

/** Searchable multi-select popover used for assignees and labels. */
export function PickerPopover({
  trigger,
  options,
  selected,
  onToggle,
  placeholder,
  footer,
}: {
  trigger: ReactNode;
  options: Option[];
  selected: string[];
  onToggle: (id: string) => void;
  placeholder: string;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  );

  return (
    <Menu
      align="left"
      className="w-64"
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="w-full text-left">
          {trigger}
        </button>
      )}
    >
      {() => (
        <div>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="mb-1 h-8 w-full rounded-lg border border-line bg-canvas px-2.5 text-body outline-none focus:border-line-focus"
          />
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 && <p className="px-2 py-2 text-caption text-ink-subtle">Tidak ada hasil.</p>}
            {filtered.map((o) => {
              const active = selected.includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={active}
                  onClick={() => onToggle(o.id)}
                  className={clsx(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-canvas-deep',
                    active && 'bg-brand-soft',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{o.render ?? o.label}</span>
                  {active && <Check className="h-4 w-4 text-brand" />}
                </button>
              );
            })}
          </div>
          {footer && <div className="mt-1 border-t border-line-subtle pt-1">{footer}</div>}
        </div>
      )}
    </Menu>
  );
}
