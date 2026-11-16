import { useMemo, type ReactNode } from 'react';
import clsx from 'clsx';
import type { UserSummary } from '@nexus/shared';
import {
  BOLD_RE,
  CODE_RE,
  FENCE_LINE,
  ITALIC_RE,
  LINK_RE,
  LIST_LINE,
  QUOTE_LINE,
  STRIKE_RE,
  URL_RE,
} from '../../lib/chatMarkdown';
import { MentionText } from '../card/MentionText';

type Block =
  | { type: 'p'; text: string }
  | { type: 'code'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; items: { indent: number; marker: string; ordered: boolean; text: string }[] };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const isSpecial = (l: string) => FENCE_LINE.test(l) || LIST_LINE.test(l) || QUOTE_LINE.test(l);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (!line.trim()) {
      i++;
      continue;
    }

    const oneLine = /^\s*```(.+?)```\s*$/.exec(line);
    if (oneLine) {
      blocks.push({ type: 'code', text: oneLine[1]! });
      i++;
      continue;
    }

    if (FENCE_LINE.test(line)) {
      let close = i + 1;
      while (close < lines.length && !FENCE_LINE.test(lines[close]!)) close++;
      if (close < lines.length) {
        blocks.push({ type: 'code', text: lines.slice(i + 1, close).join('\n') });
        i = close + 1;
        continue;
      }
      // Unclosed fence: fall through and show it as text.
    }

    if (LIST_LINE.test(line)) {
      const items: Extract<Block, { type: 'list' }>['items'] = [];
      let m: RegExpExecArray | null;
      while (i < lines.length && (m = LIST_LINE.exec(lines[i]!))) {
        const marker = m[2]!;
        items.push({
          indent: Math.min(4, Math.floor(m[1]!.replace(/\t/g, '  ').length / 2)),
          marker,
          ordered: /\d/.test(marker),
          text: m[3]!,
        });
        i++;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (QUOTE_LINE.test(line)) {
      const quoted: string[] = [];
      let m: RegExpExecArray | null;
      while (i < lines.length && (m = QUOTE_LINE.exec(lines[i]!))) {
        quoted.push(m[1]!);
        i++;
      }
      blocks.push({ type: 'quote', text: quoted.join('\n') });
      continue;
    }

    const para: string[] = [line];
    i++;
    while (i < lines.length && lines[i]!.trim() && !isSpecial(lines[i]!)) para.push(lines[i++]!);
    blocks.push({ type: 'p', text: para.join('\n') });
  }
  return blocks;
}

// Order matters: code first so its contents are never formatted.
const INLINE = new RegExp(
  [CODE_RE, BOLD_RE, STRIKE_RE, ITALIC_RE, LINK_RE, URL_RE].map((re) => `(${re.source})`).join('|'),
  'g',
);

interface InlineCtx {
  mentions: UserSummary[];
  inverted: boolean;
}

function renderInline(text: string, ctx: InlineCtx): ReactNode[] {
  const out: ReactNode[] = [];
  const re = new RegExp(INLINE.source, 'g');
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;

  const plain = (s: string) => out.push(<MentionText key={k++} body={s} mentions={ctx.mentions} />);

  while ((m = re.exec(text))) {
    if (m.index > last) plain(text.slice(last, m.index));
    last = re.lastIndex;
    const [, code, codeInner, bold, boldA, boldB, strike, strikeInner, italic, italicA, italicB, link, linkLabel, linkHref, url] = m;

    if (code) {
      out.push(
        <code
          key={k++}
          className={clsx(
            'rounded-md px-1.5 py-px font-mono text-[0.8125em]',
            ctx.inverted ? 'bg-white/20 text-white' : 'bg-surface text-danger-ink ring-1 ring-inset ring-line',
          )}
        >
          {codeInner}
        </code>,
      );
    } else if (bold) {
      out.push(
        <strong key={k++} className="font-semibold">
          {renderInline(boldA ?? boldB ?? '', ctx)}
        </strong>,
      );
    } else if (strike) {
      out.push(
        <del key={k++} className="opacity-80">
          {renderInline(strikeInner ?? '', ctx)}
        </del>,
      );
    } else if (italic) {
      out.push(<em key={k++}>{renderInline(italicA ?? italicB ?? '', ctx)}</em>);
    } else if (link) {
      out.push(<ExternalLink key={k++} href={linkHref!} inverted={ctx.inverted}>{linkLabel}</ExternalLink>);
    } else if (url) {
      out.push(<ExternalLink key={k++} href={url} inverted={ctx.inverted}>{url}</ExternalLink>);
    }
  }
  if (last < text.length) plain(text.slice(last));
  return out;
}

function ExternalLink({ href, inverted, children }: { href: string; inverted: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => e.stopPropagation()}
      className={clsx(
        'break-all underline decoration-1 underline-offset-2',
        inverted ? 'text-white decoration-white/60 hover:decoration-white' : 'text-brand-strong decoration-brand/40 hover:decoration-brand',
      )}
    >
      {children}
    </a>
  );
}

/**
 * Renders a chat message body with lightweight markdown (see lib/chatMarkdown).
 * Output is React nodes only — never HTML — so user content cannot inject markup.
 * `inverted` is for the solid brand bubble (white text).
 */
export function RichText({
  body,
  mentions,
  inverted = false,
  trailing,
}: {
  body: string;
  mentions: UserSummary[];
  inverted?: boolean;
  /** Inline suffix such as "(diedit)", placed after the last paragraph. */
  trailing?: ReactNode;
}) {
  const blocks = useMemo(() => parseBlocks(body), [body]);
  const ctx: InlineCtx = { mentions, inverted };
  const lastIsParagraph = blocks[blocks.length - 1]?.type === 'p';

  return (
    <div className="flow-root space-y-1.5 break-words [overflow-wrap:anywhere]">
      {blocks.map((block, bi) => {
        const isLast = bi === blocks.length - 1;
        switch (block.type) {
          case 'p':
            return (
              <p key={bi} className="whitespace-pre-wrap">
                {renderInline(block.text, ctx)}
                {isLast && trailing}
              </p>
            );
          case 'code':
            return (
              <pre
                key={bi}
                className={clsx(
                  'overflow-x-auto whitespace-pre rounded-lg px-3 py-2 font-mono text-[0.8125rem] leading-relaxed [overflow-wrap:normal]',
                  inverted ? 'bg-black/20 text-white' : 'border border-line bg-surface text-ink',
                )}
              >
                <code>{block.text}</code>
              </pre>
            );
          case 'quote':
            return (
              <blockquote
                key={bi}
                className={clsx('border-l-[3px] pl-3', inverted ? 'border-white/50 text-white/90' : 'border-line-strong text-ink-muted')}
              >
                <RichText body={block.text} mentions={mentions} inverted={inverted} />
              </blockquote>
            );
          case 'list':
            return (
              <ul key={bi} className="space-y-0.5">
                {block.items.map((item, ii) => (
                  <li key={ii} className="flex gap-2" style={{ paddingLeft: `${item.indent * 1.125}rem` }}>
                    <span
                      aria-hidden
                      className={clsx(
                        'shrink-0 select-none tabular-nums',
                        item.ordered ? 'min-w-[1.1rem] text-right' : 'w-[0.6rem] text-center',
                        inverted ? 'text-white/80' : 'text-ink-subtle',
                      )}
                    >
                      {item.ordered ? item.marker.replace(')', '.') : item.indent % 2 ? '◦' : '•'}
                    </span>
                    <span className="min-w-0 flex-1 whitespace-pre-wrap">{renderInline(item.text, ctx)}</span>
                  </li>
                ))}
              </ul>
            );
        }
      })}
      {!lastIsParagraph && trailing && <div className="flow-root">{trailing}</div>}
    </div>
  );
}
