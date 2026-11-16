/**
 * Lightweight markdown for chat messages (Slack-style). Messages are stored as plain
 * text; formatting lives in markers: **bold**, _italic_, ~~strike~~, `code`,
 * ```code block```, "- " / "1. " lists, "> " quotes and [label](https://…) links.
 *
 * This module is pure: HTML → markdown for paste, editing helpers for the composer
 * and a plain-text stripper for previews. Rendering lives in features/chat/RichText.
 */

// ─── Shared patterns ──────────────────────────────────────────────────

export const BOLD_RE = /\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/;
export const STRIKE_RE = /~~(?=\S)([\s\S]*?\S)~~/;
export const ITALIC_RE = /(?<![\w*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?![\w*])|(?<![\w_])_(?=[^\s_])([^_\n]*?[^\s_])_(?![\w_])/;
export const CODE_RE = /`([^`\n]+)`/;
export const LINK_RE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/;
export const URL_RE = /https?:\/\/[^\s<]*[^\s<.,:;"'!?)\]]/;

export const LIST_LINE = /^(\s*)([-*•]|\d{1,3}[.)])\s+(.*)$/;
export const QUOTE_LINE = /^>\s?(.*)$/;
export const FENCE_LINE = /^\s*```/;

// ─── Previews ─────────────────────────────────────────────────────────

const g = (re: RegExp) => new RegExp(re.source, 'g');

/** Strips markers so sidebar / reply previews read as plain text. */
export function plainText(body: string): string {
  return body
    .replace(/```[^\n]*\n?([\s\S]*?)```/g, '$1')
    .replace(g(LINK_RE), '$1')
    .replace(g(BOLD_RE), (_m, a?: string, b?: string) => a ?? b ?? '')
    .replace(g(STRIKE_RE), '$1')
    .replace(g(ITALIC_RE), (_m, a?: string, b?: string) => a ?? b ?? '')
    .replace(g(CODE_RE), '$1')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^(\s*)[-*]\s+/gm, '$1• ');
}

// ─── HTML → markdown (paste) ──────────────────────────────────────────

const B = '\u0000'; // block boundary, collapsed into newlines at the end
const IND = '\u0002'; // list indentation, survives whitespace collapsing

interface Ctx {
  inItem: boolean;
  depth: number;
  marks: ReadonlySet<string>;
  state: { formatted: boolean };
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'address',
  'figure', 'figcaption', 'table', 'thead', 'tbody', 'tfoot', 'dl', 'dt', 'dd', 'details', 'summary', 'li',
]);
const SKIP_TAGS = new Set(['script', 'style', 'head', 'title', 'meta', 'link', 'img', 'svg', 'picture', 'video', 'audio', 'iframe', 'object', 'button', 'input', 'select', 'textarea']);

/**
 * Converts clipboard HTML (Google Docs, Word, Notion, web pages, our own chat) into
 * chat markdown. Returns null when the HTML carries no formatting worth keeping, so the
 * browser's plain-text paste (which preserves things like code indentation) is used.
 */
export function htmlToChatMarkdown(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const ctx: Ctx = { inItem: false, depth: 0, marks: new Set(), state: { formatted: false } };
  const out = finalize(walkChildren(doc.body, ctx));
  return ctx.state.formatted && out ? out : null;
}

function walkChildren(el: Element, ctx: Ctx): string {
  return Array.from(el.childNodes)
    .map((n) => walk(n, ctx))
    .join('');
}

function walk(node: Node, ctx: Ctx): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? '').replace(/ /g, ' ').replace(/[ \t\r\n\f]+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const { state } = ctx;

  if (SKIP_TAGS.has(tag)) return '';
  switch (tag) {
    case 'br':
      return '\n';
    case 'hr':
      return B;
    case 'pre': {
      state.formatted = true;
      return `${B}\`\`\`\n${(el.textContent ?? '').replace(/\n+$/, '')}\n\`\`\`${B}`;
    }
    case 'ul':
    case 'ol':
      return list(el, tag === 'ol', ctx);
    case 'blockquote': {
      const inner = finalize(walkChildren(el, { ...ctx, inItem: false }));
      if (!inner) return '';
      state.formatted = true;
      return B + inner.split('\n').map((l) => `> ${l}`).join('\n') + B;
    }
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const inner = walkChildren(el, { ...ctx, marks: new Set([...ctx.marks, '**']) });
      return B + (ctx.marks.has('**') ? inner : wrapInline(inner, '**', state)) + B;
    }
    case 'tr': {
      const cells = Array.from(el.children)
        .map((c) => finalize(walk(c, ctx)).replace(/\s*\n\s*/g, ' '))
        .filter(Boolean);
      if (cells.length > 1) state.formatted = true;
      return B + cells.join(' | ') + B;
    }
    case 'a': {
      const text = walkChildren(el, ctx);
      const href = el.getAttribute('href') ?? '';
      if (!/^https?:\/\//i.test(href)) return text;
      const label = text.replace(/[\u0000\n]+/g, ' ').trim();
      if (!label || label.replace(/\/$/, '') === href.replace(/\/$/, '')) return href;
      state.formatted = true;
      return `[${label.replace(/[[\]]/g, '')}](${href.replace(/\)/g, '%29').replace(/\s/g, '%20')})`;
    }
    case 'code':
    case 'kbd':
    case 'samp':
    case 'tt': {
      const text = (el.textContent ?? '').replace(/\s*\n\s*/g, ' ');
      if (!text.trim()) return text;
      state.formatted = true;
      return `\`${text.replace(/`/g, "'")}\``;
    }
  }

  // Word list bullets: <span style="mso-list:Ignore">·&nbsp;&nbsp;</span>
  const styleAttr = (el.getAttribute('style') ?? '').toLowerCase();
  if (/mso-list\s*:\s*ignore/.test(styleAttr)) {
    state.formatted = true;
    const marker = (el.textContent ?? '').replace(/[\s ]/g, '');
    return /^\d+[.)]$/.test(marker) ? `${marker} ` : '- ';
  }

  const marks: string[] = [];
  const weight = el.style.fontWeight;
  const normalWeight = /^(normal|lighter|[1-5]00)$/.test(weight);
  const bold = !normalWeight && (tag === 'b' || tag === 'strong' || /^(bold|bolder|[6-9]00)$/.test(weight));
  const italic = (tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic') && el.style.fontStyle !== 'normal';
  const strike = tag === 's' || tag === 'del' || tag === 'strike' || /line-through/.test(el.style.textDecoration);
  if (bold && !ctx.marks.has('**')) marks.push('**');
  if (italic && !ctx.marks.has('_')) marks.push('_');
  if (strike && !ctx.marks.has('~~')) marks.push('~~');

  let out = walkChildren(el, marks.length ? { ...ctx, marks: new Set([...ctx.marks, ...marks]) } : ctx);
  for (const mk of marks) out = wrapInline(out, mk, state);

  if (BLOCK_TAGS.has(tag)) {
    // Paragraphs inside a list item stay on the item's line.
    if (ctx.inItem && (tag === 'p' || tag === 'div')) return out;
    return B + out + B;
  }
  return out;
}

function list(el: HTMLElement, ordered: boolean, ctx: Ctx): string {
  ctx.state.formatted = true;
  let n = Number(el.getAttribute('start')) || 1;
  const items = Array.from(el.children).map((child) => {
    const tag = child.tagName.toLowerCase();
    // Common invalid nesting: <ul><li>a</li><ul>…</ul></ul>
    if (tag === 'ul' || tag === 'ol') return walk(child, { ...ctx, depth: ctx.depth + 1 });
    if (tag !== 'li') return walk(child, ctx);
    const marker = ordered ? `${n++}. ` : '- ';
    const body = walkChildren(child, { ...ctx, inItem: true, depth: ctx.depth + 1 });
    return B + IND.repeat(ctx.depth * 2) + marker + body.replace(/^[\s\u0000]+/, '');
  });
  return B + items.join('') + B;
}

/** Wraps each line of `content` in `mk`, keeping surrounding spaces outside the markers. */
function wrapInline(content: string, mk: string, state: Ctx['state']): string {
  return content
    .split(/([\u0000\n]+)/)
    .map((seg, i) => {
      if (i % 2 === 1) return seg;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(seg);
      if (!m || !m[2]) return seg;
      state.formatted = true;
      return `${m[1]}${mk}${m[2]}${mk}${m[3]}`;
    })
    .join('');
}

function finalize(s: string): string {
  return s
    .replace(/\s*\u0000[\s\u0000]*/g, (m) => (m.includes('\n') ? '\n\n' : '\n'))
    .replace(/\u0002/g, ' ')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '');
}

// ─── Composer editing helpers ─────────────────────────────────────────

export type FormatKind = 'bold' | 'italic' | 'strike' | 'code' | 'ul' | 'ol' | 'quote';

/** One replacement in the textarea plus the selection to restore afterwards. */
export interface TextEdit {
  from: number;
  to: number;
  insert: string;
  selStart: number;
  selEnd: number;
}

const WRAP: Record<'bold' | 'italic' | 'strike' | 'code', string> = { bold: '**', italic: '_', strike: '~~', code: '`' };

export function formatEdit(value: string, start: number, end: number, kind: FormatKind): TextEdit {
  if (kind === 'ul' || kind === 'ol' || kind === 'quote') return linePrefixEdit(value, start, end, kind);
  if (kind === 'code' && value.slice(start, end).includes('\n')) return fenceEdit(value, start, end);
  return wrapEdit(value, start, end, WRAP[kind]);
}

function wrapEdit(value: string, start: number, end: number, mk: string): TextEdit {
  const n = mk.length;
  while (start < end && /\s/.test(value[start]!)) start++;
  while (end > start && /\s/.test(value[end - 1]!)) end--;
  const sel = value.slice(start, end);

  // Toggle off: markers right outside the selection (or around the caret).
  if (start >= n && value.slice(start - n, start) === mk && value.slice(end, end + n) === mk) {
    return { from: start - n, to: end + n, insert: sel, selStart: start - n, selEnd: end - n };
  }
  // Toggle off: the selection itself includes the markers.
  if (sel.length >= 2 * n + 1 && sel.startsWith(mk) && sel.endsWith(mk)) {
    const inner = sel.slice(n, -n);
    return { from: start, to: end, insert: inner, selStart: start, selEnd: start + inner.length };
  }
  return { from: start, to: end, insert: mk + sel + mk, selStart: start + n, selEnd: end + n };
}

function fenceEdit(value: string, start: number, end: number): TextEdit {
  const lead = start > 0 && value[start - 1] !== '\n' ? '\n' : '';
  const trail = end < value.length && value[end] !== '\n' ? '\n' : '';
  const sel = value.slice(start, end).replace(/^\n+|\n+$/g, '');
  const insert = `${lead}\`\`\`\n${sel}\n\`\`\`${trail}`;
  const innerStart = start + lead.length + 4;
  return { from: start, to: end, insert, selStart: innerStart, selEnd: innerStart + sel.length };
}

const PREFIX = {
  ul: /^(\s*)[-*•]\s+/,
  ol: /^(\s*)\d{1,3}[.)]\s+/,
  quote: /^(\s*)>\s?/,
} as const;

function linePrefixEdit(value: string, start: number, end: number, kind: 'ul' | 'ol' | 'quote'): TextEdit {
  const from = value.lastIndexOf('\n', start - 1) + 1;
  const lastLineEnd = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nl = value.indexOf('\n', lastLineEnd);
  const to = nl === -1 ? value.length : nl;
  const lines = value.slice(from, to).split('\n');
  const re = PREFIX[kind];

  const removing = lines.every((l) => re.test(l));
  const next = removing
    ? lines.map((l) => l.replace(re, '$1'))
    : lines.map((l, i) => {
        const stripped = l.replace(PREFIX.ul, '$1').replace(PREFIX.ol, '$1').replace(PREFIX.quote, '$1');
        const indent = /^\s*/.exec(stripped)![0];
        const prefix = kind === 'ul' ? '- ' : kind === 'ol' ? `${i + 1}. ` : '> ';
        return indent + prefix + stripped.slice(indent.length);
      });
  const insert = next.join('\n');
  const collapsed = start === end;
  return {
    from,
    to,
    insert,
    selStart: collapsed ? from + insert.length : from,
    selEnd: from + insert.length,
  };
}

/**
 * Newline inside a list or quote: continue it ("- " → "- ", "3. " → "4. ").
 * On an empty item, drop the marker instead (leaves the list). Null when not in one.
 */
export function continueListEdit(value: string, start: number, end: number): TextEdit | null {
  if (start !== end) return null;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const line = value.slice(lineStart, start);

  let prefix: string | null = null;
  let empty = false;
  const ul = /^(\s*)([-*•])\s+(.*)$/.exec(line);
  const ol = /^(\s*)(\d{1,3})([.)])\s+(.*)$/.exec(line);
  const quote = /^>\s?(.*)$/.exec(line);
  if (ul) {
    prefix = `${ul[1]}${ul[2]} `;
    empty = !ul[3]!.trim();
  } else if (ol) {
    prefix = `${ol[1]}${Number(ol[2]) + 1}${ol[3]} `;
    empty = !ol[4]!.trim();
  } else if (quote) {
    prefix = '> ';
    empty = !quote[1]!.trim();
  }
  if (prefix === null) return null;

  if (empty) return { from: lineStart, to: start, insert: '', selStart: lineStart, selEnd: lineStart };
  const insert = `\n${prefix}`;
  return { from: start, to: end, insert, selStart: start + insert.length, selEnd: start + insert.length };
}

/**
 * Applies an edit through `insertText` so the browser's undo stack keeps working;
 * falls back to setting the value directly.
 */
export function applyTextEdit(el: HTMLTextAreaElement, edit: TextEdit, setValue: (value: string) => void) {
  el.focus();
  el.setSelectionRange(edit.from, edit.to);
  let ok = false;
  try {
    if (edit.insert) ok = document.execCommand('insertText', false, edit.insert);
    else ok = edit.from === edit.to || document.execCommand('delete');
  } catch {
    ok = false;
  }
  if (ok) {
    el.setSelectionRange(edit.selStart, edit.selEnd);
    return;
  }
  setValue(el.value.slice(0, edit.from) + edit.insert + el.value.slice(edit.to));
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(edit.selStart, edit.selEnd);
  });
}
