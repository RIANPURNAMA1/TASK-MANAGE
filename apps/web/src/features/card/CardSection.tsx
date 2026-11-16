import type { ReactNode } from 'react';
import type { LabelDTO } from '@nexus/shared';
import { readableTextOn } from '../../lib/color';

/** Section heading used across the card detail: icon, title, optional meta and actions. */
export function CardSection({
  icon,
  title,
  meta,
  actions,
  children,
}: {
  icon: ReactNode;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <header className="mb-3 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-canvas-deep text-ink-muted [&>svg]:h-4 [&>svg]:w-4">
          {icon}
        </span>
        <h3 className="text-[0.9375rem] font-medium text-ink">{title}</h3>
        {meta && <span className="text-[0.8125rem] font-semibold text-ink-subtle">{meta}</span>}
        {actions && <div className="ml-auto flex items-center gap-1.5">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** Solid label pill — same treatment as on Kanban cards. */
export function SolidLabel({ label }: { label: LabelDTO }) {
  return (
    <span
      className="inline-flex h-6 max-w-[160px] items-center rounded-full px-2.5 text-[11px] font-bold"
      style={{ backgroundColor: label.color, color: readableTextOn(label.color) }}
    >
      <span className="truncate">{label.name}</span>
    </span>
  );
}
