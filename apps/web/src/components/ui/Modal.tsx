import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** `full` covers the whole viewport (no backdrop gap, no rounded corners). */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** Hide the default header (for custom layouts such as the card detail). */
  bare?: boolean;
}

/** Open modals, innermost last — only the top one reacts to Escape. */
const modalStack: symbol[] = [];

const widths = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-[760px]',
  '2xl': 'max-w-[1040px]',
  full: '',
};

/** Accessible dialog: Esc closes, focus moves inside on open and returns on close. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', bare }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Keep the latest callback without re-running the focus effect when its identity changes.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const token = Symbol('modal');
    modalStack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack.at(-1) === token) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    const focusable = panelRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button:not([data-modal-close]), [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panelRef.current)?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(token), 1);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Lock page scroll behind a full-screen modal.
  useEffect(() => {
    if (!open || size !== 'full') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, size]);

  if (!open) return null;

  if (size === 'full') {
    return createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="fixed inset-0 z-50 flex flex-col bg-surface"
      >
        {children}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[6vh] backdrop-blur-[2px]">
      <div className="fixed inset-0" aria-hidden onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={clsx('relative w-full rounded-modal bg-surface shadow-modal', widths[size])}
      >
        {!bare && (
          <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-5 py-4">
            <div>
              {title && <h2 className="text-h2 text-ink">{title}</h2>}
              {description && <p className="mt-1 text-body text-ink-muted">{description}</p>}
            </div>
            <CloseButton onClick={onClose} />
          </div>
        )}
        <div className={bare ? '' : 'px-5 py-4'}>{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line-subtle px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-modal-close
      onClick={onClick}
      aria-label="Tutup"
      className="rounded-lg p-1.5 text-ink-subtle hover:bg-canvas-deep hover:text-ink"
    >
      <X className="h-4 w-4" />
    </button>
  );
}
