import { useEffect, useState } from 'react';
import { TYPING_TTL_MS, useTyping } from './stores';

/** "Ayu sedang mengetik…" with animated dots (FR-33). Entries older than 4 s are ignored. */
export function TypingIndicator({ channelId }: { channelId: string }) {
  const entries = useTyping((s) => s.byChannel[channelId]);
  const [now, setNow] = useState(Date.now());

  // Re-evaluate expiry while someone might still be typing.
  useEffect(() => {
    if (!entries || Object.keys(entries).length === 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [entries]);

  const names = Object.values(entries ?? {})
    .filter((e) => now - e.at < TYPING_TTL_MS)
    .map((e) => e.name.split(' ')[0]);

  const text =
    names.length === 0
      ? ''
      : names.length === 1
        ? `${names[0]} sedang mengetik`
        : names.length === 2
          ? `${names[0]} dan ${names[1]} sedang mengetik`
          : `${names.length} orang sedang mengetik`;

  return (
    <div className="flex h-7 w-full shrink-0 items-center px-4 sm:px-6" aria-live="polite">
      {text && (
        <p className="inline-flex items-center gap-2 pl-[3.25rem] text-caption text-ink-subtle">
          <span className="inline-flex gap-[3px]" aria-hidden>
            {[0, 150, 300].map((delay) => (
              <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-subtle/70" style={{ animationDelay: `${delay}ms` }} />
            ))}
          </span>
          {text}…
        </p>
      )}
    </div>
  );
}
