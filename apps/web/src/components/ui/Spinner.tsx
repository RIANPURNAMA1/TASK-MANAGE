import clsx from 'clsx';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('animate-spin text-current', className ?? 'h-5 w-5')}
      viewBox="0 0 24 24"
      fill="none"
      role="status"
      aria-label="Memuat"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-canvas-deep', className)} />;
}

export function PageSpinner() {
  return (
    <div className="flex h-full min-h-[240px] items-center justify-center text-brand">
      <Spinner className="h-6 w-6" />
    </div>
  );
}
