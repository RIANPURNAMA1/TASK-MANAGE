import { Fragment } from 'react';
import type { UserSummary } from '@nexus/shared';

/**
 * Highlights `@Name` tokens of the users actually mentioned. Renders text nodes only
 * (never HTML), so user content cannot inject markup. Used by comments and chat.
 */
export function MentionText({ body, mentions }: { body: string; mentions: UserSummary[] }) {
  if (mentions.length === 0) return <>{body}</>;
  const escaped = mentions.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const parts = body.split(new RegExp(`(@(?:${escaped.join('|')}))`, 'g'));
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="rounded bg-brand-subtle px-0.5 font-medium text-brand-strong">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
