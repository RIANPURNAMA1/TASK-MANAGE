import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import clsx from 'clsx';

const control =
  'w-full rounded-lg border border-line bg-canvas px-3 text-body text-ink placeholder:text-ink-subtle transition-colors ' +
  'focus:border-line-focus focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-subtle ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={clsx(control, 'h-9', className)} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={clsx(control, 'min-h-[80px] py-2', className)} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...rest }, ref) {
    return (
      <select ref={ref} className={clsx(control, 'h-9 pr-8', className)} {...rest}>
        {children}
      </select>
    );
  },
);

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
  className?: string;
}

/** Label + control + error/hint, wired together for screen readers. */
export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId();
  return (
    <div className={clsx('space-y-1.5', className)}>
      <label htmlFor={id} className="block text-body font-medium text-ink">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-caption text-danger-ink" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-caption text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-brand' : 'bg-line',
      )}
    >
      <span
        className={clsx(
          'inline-block h-4 w-4 rounded-full bg-white shadow-card transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}
