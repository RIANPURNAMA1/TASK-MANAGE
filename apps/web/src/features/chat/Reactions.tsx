import { useState } from 'react';
import clsx from 'clsx';
import { SmilePlus } from 'lucide-react';
import type { ReactionDTO } from '@nexus/shared';

export const QUICK_EMOJI = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🙏', '✅'] as const;

/** Reaction pills under a message; clicking toggles the caller's reaction (FR-31). */
export function ReactionBar({
  reactions,
  myId,
  onToggle,
}: {
  reactions: ReactionDTO[];
  myId: string;
  onToggle: (emoji: string) => void;
}) {
  if (reactions.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {reactions.map((r) => {
        const mine = r.userIds.includes(myId);
        return (
          <button
            key={r.emoji}
            type="button"
            onClick={() => onToggle(r.emoji)}
            aria-pressed={mine}
            aria-label={`${r.emoji} ${r.count} reaksi${mine ? ', termasuk Anda' : ''}`}
            className={clsx(
              'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption font-bold tabular-nums transition-colors',
              mine
                ? 'border-brand-border bg-brand-subtle text-brand-strong'
                : 'border-line bg-surface text-ink-muted shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-line-strong',
            )}
          >
            <span className="text-body leading-none">{r.emoji}</span>
            {r.count}
          </button>
        );
      })}
    </div>
  );
}

/** Small popover with the common reactions. */
export function EmojiPickerButton({ onPick, align = 'right' }: { onPick: (emoji: string) => void; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Tambah reaksi"
        title="Tambah reaksi"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={(e) => {
          if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        className={clsx(
          'flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-canvas-deep hover:text-ink',
          open && 'bg-canvas-deep text-ink',
        )}
      >
        <SmilePlus className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className={clsx(
            'absolute top-full z-30 mt-2 flex gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-card-hover',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          {QUICK_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              aria-label={`Reaksi ${emoji}`}
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              className="rounded-lg px-1.5 py-1 text-h3 leading-none hover:bg-canvas-deep"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
