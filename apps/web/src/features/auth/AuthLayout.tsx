import type { ReactNode } from 'react';
import { Logo } from '../../components/layout/Logo';

export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="flex min-h-full items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-modal border border-line bg-surface p-7 shadow-card">
          <h1 className="text-display text-ink">{title}</h1>
          {description && <p className="mt-1.5 text-body text-ink-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-body text-ink-muted">{footer}</div>}
      </div>
    </main>
  );
}

/**
 * Split auth layout: form panel on the left, product showcase on the right
 * (hidden below `lg`, so narrow desktop windows get a clean centered form).
 */
export function AuthSplitLayout({
  title,
  description,
  children,
  footer,
  aside,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  aside: ReactNode;
}) {
  return (
    <main className="flex min-h-full bg-paper lg:p-3">
      <section className="flex w-full flex-col px-6 py-8 sm:px-10 lg:w-[46%] lg:max-w-[560px] lg:px-14">
        <Logo />
        <div className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-[360px]">
            <h1 className="text-display font-bold text-ink">{title}</h1>
            {description && <p className="mt-1.5 text-body text-ink-muted">{description}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>
        {footer && <div className="text-caption text-ink-subtle">{footer}</div>}
      </section>
      <aside className="hidden flex-1 lg:block">{aside}</aside>
    </main>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-body text-danger-ink">
      {message}
    </div>
  );
}

export function FormSuccess({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-lg bg-success-soft px-3 py-2.5 text-body text-success-ink">
      {children}
    </div>
  );
}
