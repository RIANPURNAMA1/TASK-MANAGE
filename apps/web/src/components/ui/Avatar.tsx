import { useState } from 'react';
import clsx from 'clsx';
import type { UserSummary } from '@nexus/shared';
import { resolveApiUrl } from '../../lib/apiBase';
import { initials } from '../../lib/format';

// Deterministic background per user so the same person always looks the same.
const tones = [
  'bg-brand-subtle text-brand-strong',
  'bg-success-soft text-success-ink',
  'bg-warning-soft text-warning-ink',
  'bg-danger-soft text-danger-ink',
  'bg-canvas-deep text-ink-muted',
];

function toneFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length] ?? tones[0]!;
}

const sizes = {
  xs: 'h-5 w-5 text-[9px]',
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-caption',
  lg: 'h-10 w-10 text-body',
  xl: 'h-14 w-14 text-[1.125rem]',
  '2xl': 'h-24 w-24 text-[1.75rem]',
};

type AvatarUser = Pick<UserSummary, 'id' | 'name' | 'avatarUrl'>;

export function Avatar({ user, size = 'sm', className }: { user: AvatarUser; size?: keyof typeof sizes; className?: string }) {
  // Falls back to initials when the photo cannot load (removed, offline, expired link).
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = user.avatarUrl && user.avatarUrl !== failedUrl ? resolveApiUrl(user.avatarUrl) : null;
  return (
    <span
      title={user.name}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ring-2 ring-surface',
        sizes[size],
        !photo && toneFor(user.id),
        className,
      )}
    >
      {photo ? (
        <img src={photo} alt={user.name} className="h-full w-full object-cover" onError={() => setFailedUrl(user.avatarUrl)} />
      ) : (
        initials(user.name)
      )}
    </span>
  );
}

export function AvatarStack({ users, max = 3, size = 'sm' }: { users: AvatarUser[]; max?: number; size?: keyof typeof sizes }) {
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <div className="flex -space-x-1.5">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {rest > 0 && (
        <span
          className={clsx(
            'inline-flex items-center justify-center rounded-full bg-canvas-deep font-semibold text-ink-muted ring-2 ring-surface',
            sizes[size],
          )}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
