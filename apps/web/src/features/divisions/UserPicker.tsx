import { useEffect, useState } from 'react';
import type { UserSummary } from '@nexus/shared';
import { Avatar, Input, Spinner } from '../../components/ui';
import { useUserSearch } from './hooks';

/** Search-as-you-type picker over the organization directory. */
export function UserPicker({
  onPick,
  excludeIds = [],
  placeholder = 'Cari nama atau email…',
}: {
  onPick: (user: UserSummary) => void;
  excludeIds?: string[];
  placeholder?: string;
}) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  // Debounce so we don't hit the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);

  const users = useUserSearch(query, open);
  const results = (users.data ?? []).filter((u) => !excludeIds.includes(u.id)).slice(0, 8);

  return (
    <div className="relative">
      <Input
        value={input}
        placeholder={placeholder}
        aria-label={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setInput(e.target.value)}
      />
      {open && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-card-hover">
          {users.isFetching && results.length === 0 && (
            <li className="flex justify-center p-3 text-brand">
              <Spinner className="h-4 w-4" />
            </li>
          )}
          {!users.isFetching && results.length === 0 && <li className="px-3 py-2 text-ink-subtle">Tidak ada pengguna.</li>}
          {results.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(u);
                  setInput('');
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-canvas-deep"
              >
                <Avatar user={u} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{u.name}</span>
                  <span className="block truncate text-caption text-ink-subtle">{u.email}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
