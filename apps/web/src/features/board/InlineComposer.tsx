import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { CornerDownLeft, Plus } from 'lucide-react';
import { Button } from '../../components/ui';

/**
 * "+ Tambah …" button that expands into a small form. Stays open after submitting for
 * rapid entry. Open state can be controlled (e.g. by a "+" in a column header).
 */
export function InlineComposer({
  label,
  placeholder,
  onSubmit,
  multiline,
  hideLabel,
  className,
  submitLabel = 'Simpan',
  icon = <Plus className="h-4 w-4" />,
  open: controlledOpen,
  onOpenChange,
}: {
  label: string;
  placeholder: string;
  onSubmit: (value: string) => Promise<unknown> | void;
  multiline?: boolean;
  /** Icon-only trigger; the label is kept for screen readers. */
  hideLabel?: boolean;
  className?: string;
  submitLabel?: string;
  icon?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setValue('');
    setOpen(false);
  };

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return close();
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          'flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-body font-medium text-ink-subtle transition-colors hover:bg-surface hover:text-ink'
        }
      >
        {icon}
        {hideLabel ? <span className="sr-only">{label}</span> : label}
      </button>
    );
  }

  const field = {
    autoFocus: true,
    value,
    placeholder,
    'aria-label': placeholder,
    disabled: busy,
    onChange: (e: { target: { value: string } }) => setValue(e.target.value),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
      if (e.key === 'Escape') close();
    },
    // Clicking away with nothing typed simply closes the composer.
    onBlur: () => {
      if (!value.trim() && !busy) close();
    },
    className:
      'w-full resize-none bg-transparent text-body font-semibold leading-snug text-ink outline-none placeholder:font-normal placeholder:text-ink-subtle',
  };

  return (
    <div className="rounded-kanban border border-brand-border bg-surface p-2.5 shadow-card ring-4 ring-brand-subtle">
      {multiline ? <textarea rows={2} {...field} /> : <input {...field} />}
      <div className="mt-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-caption text-ink-subtle">
          <CornerDownLeft className="h-3 w-3" aria-hidden /> Enter untuk simpan · Esc batal
        </span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" className="h-7 px-2" onMouseDown={(e) => e.preventDefault()} onClick={close}>
            Batal
          </Button>
          <Button
            size="sm"
            className="h-7 px-2.5"
            loading={busy}
            // Keep focus in the field so onBlur doesn't close the form before submit runs.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void submit()}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
