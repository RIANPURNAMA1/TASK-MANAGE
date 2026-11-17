import { Fragment, type ReactNode } from 'react';

/**
 * Tiny, safe markdown for agent replies: **bold**, `code`, bullet / numbered lists, and links.
 * It builds React nodes (never HTML strings), so model output can't inject markup or scripts, and
 * only http(s) links become clickable.
 */
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>)]+)/g;

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>;
    const md = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (md) return link(i, md[2]!, md[1]!);
    if (/^https?:\/\//.test(part)) return link(i, part.replace(/[.,;:!?]+$/, ''), part);
    return <Fragment key={i}>{part}</Fragment>;
  });
}

function link(key: number, href: string, label: string) {
  return (
    <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand underline">
      {label}
    </a>
  );
}

export function AgentMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;

  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={`l${blocks.length}`} className={list.ordered ? 'my-1 list-decimal pl-5' : 'my-1 list-disc pl-5'}>
        {list.items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </Tag>,
    );
    list = null;
  };

  lines.forEach((line, i) => {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push(inline((bullet ?? numbered)![1]!));
      return;
    }
    flush();
    if (heading) blocks.push(<p key={i} className="mt-2 font-semibold">{inline(heading[1]!)}</p>);
    else if (line.trim() === '') blocks.push(<div key={i} className="h-1.5" />);
    else blocks.push(<p key={i}>{inline(line)}</p>);
  });
  flush();

  return (
    <div className="space-y-0.5 break-words text-[0.875rem] leading-relaxed [&_code]:rounded [&_code]:bg-canvas-deep [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.8em]">
      {blocks}
    </div>
  );
}
