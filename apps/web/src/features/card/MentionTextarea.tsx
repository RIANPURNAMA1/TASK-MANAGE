import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import clsx from 'clsx';
import type { UserSummary } from '@nexus/shared';
import { Avatar } from '../../components/ui';
import {
  applyTextEdit,
  continueListEdit,
  formatEdit,
  htmlToChatMarkdown,
  type FormatKind,
  type TextEdit,
} from '../../lib/chatMarkdown';

const TRIGGER = /(?:^|\s)@([^\s@]{0,30})$/;
const MAX_AUTO_HEIGHT = 200;

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  members: UserSummary[];
  onMention: (user: UserSummary) => void;
  onSubmit?: () => void;
  /** Escape pressed while no suggestion list is open (e.g. cancel edit / reply). */
  onEscape?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /**
   * Chat style: Enter submits, Shift+Enter inserts a newline, and the field grows with
   * its content. Default (comments): Ctrl/Cmd+Enter submits, manually resizable.
   */
  chat?: boolean;
  /** No border/background of its own — for embedding inside a composer box. */
  bare?: boolean;
  /**
   * Markdown helpers: formatted paste (HTML → markdown), Ctrl/Cmd+B/I/E/Shift+X
   * shortcuts and list continuation on newline.
   */
  formatting?: boolean;
  /** Files pasted from the clipboard (screenshots, copied files). */
  onPasteFiles?: (files: File[]) => void;
}

export interface MentionTextareaHandle {
  focus: () => void;
  /** Applies a formatting toggle to the current selection. */
  format: (kind: FormatKind) => void;
}

/**
 * Plain textarea with `@` autocomplete over members (FR-12, FR-31).
 * Selected users are reported via `onMention`; callers decide which are still present.
 */
export const MentionTextarea = forwardRef<MentionTextareaHandle, MentionTextareaProps>(function MentionTextarea(
  { value, onChange, members, onMention, onSubmit, onEscape, placeholder, autoFocus, disabled, chat, bare, formatting, onPasteFiles },
  handle,
) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  // Latest onChange for imperative edits (the handle is created once).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const edit = (make: (el: HTMLTextAreaElement) => TextEdit | null): boolean => {
    const el = ref.current;
    if (!el) return false;
    const next = make(el);
    if (!next) return false;
    applyTextEdit(el, next, (v) => onChangeRef.current(v));
    return true;
  };

  useImperativeHandle(
    handle,
    () => ({
      focus: () => ref.current?.focus(),
      format: (kind) => void edit((el) => formatEdit(el.value, el.selectionStart, el.selectionEnd, kind)),
    }),
    [],
  );

  // Auto-grow for chat: reset then fit to content, capped so long drafts scroll.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!chat || !el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_AUTO_HEIGHT)}px`;
  }, [chat, value]);

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [members, query]);

  const detect = (text: string, caret: number) => {
    const match = TRIGGER.exec(text.slice(0, caret));
    setQuery(match ? (match[1] ?? '') : null);
    setHighlight(0);
  };

  const select = (user: UserSummary) => {
    const el = ref.current;
    if (!el || query === null) return;
    const caret = el.selectionStart;
    const start = caret - query.length - 1; // include the "@"
    const insert = `@${user.name} `;
    const next = value.slice(0, start) + insert + value.slice(caret);
    onChange(next);
    onMention(user);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + insert.length, start + insert.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        setHighlight((h) => (h + delta + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const user = suggestions[highlight];
        if (user) select(user);
        return;
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        setQuery(null);
        return;
      }
    }
    if (formatting) {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const kind: FormatKind | null = !mod
        ? null
        : !e.shiftKey && key === 'b'
          ? 'bold'
          : !e.shiftKey && key === 'i'
            ? 'italic'
            : !e.shiftKey && key === 'e'
              ? 'code'
              : e.shiftKey && key === 'x'
                ? 'strike'
                : null;
      if (kind) {
        e.preventDefault();
        edit((el) => formatEdit(el.value, el.selectionStart, el.selectionEnd, kind));
        return;
      }
      const newline = e.key === 'Enter' && !e.nativeEvent.isComposing && (chat ? e.shiftKey : !mod && !e.shiftKey);
      if (newline && edit((el) => continueListEdit(el.value, el.selectionStart, el.selectionEnd))) {
        e.preventDefault();
        return;
      }
    }
    if (e.key === 'Escape' && onEscape) {
      e.stopPropagation();
      onEscape();
      return;
    }
    const submitKey = chat
      ? e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing
      : e.key === 'Enter' && (e.ctrlKey || e.metaKey);
    if (submitKey) {
      e.preventDefault();
      onSubmit?.();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const data = e.clipboardData;
    // Word/Excel also put a picture of the selection on the clipboard; text wins then.
    const files = Array.from(data.files);
    if (files.length > 0 && onPasteFiles && !data.getData('text/plain')) {
      e.preventDefault();
      onPasteFiles(files);
      return;
    }
    if (!formatting) return;
    const html = data.getData('text/html');
    const markdown = html ? htmlToChatMarkdown(html) : null;
    if (!markdown) return; // no formatting: let the browser paste plain text
    e.preventDefault();
    edit((el) => {
      const caret = el.selectionStart + markdown.length;
      return { from: el.selectionStart, to: el.selectionEnd, insert: markdown, selStart: caret, selEnd: caret };
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={chat ? 1 : 3}
        value={value}
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-autocomplete="list"
        aria-expanded={suggestions.length > 0}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart);
        }}
        onClick={(e) => detect(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 120)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className={clsx(
          'w-full text-body text-ink placeholder:text-ink-subtle disabled:cursor-not-allowed',
          bare
            ? 'bg-transparent px-0 py-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0'
            : 'rounded-lg border border-line bg-surface px-3 py-2 focus:border-line-focus focus:outline-none focus:ring-2 focus:ring-brand-subtle disabled:bg-canvas',
          chat ? 'resize-none overflow-y-auto' : 'resize-y',
        )}
      />
      {suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 z-30 mb-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-card-hover"
        >
          {suggestions.map((user, i) => (
            <li key={user.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(user)}
                className={clsx(
                  'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left',
                  i === highlight ? 'bg-brand-subtle' : 'hover:bg-canvas-deep',
                )}
              >
                <Avatar user={user} size="xs" />
                <span className="truncate font-medium text-ink">{user.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

/** Ids of picked users whose `@Name` token still appears in the text. */
export function activeMentionIds(body: string, picked: UserSummary[]): string[] {
  return [...new Set(picked.filter((u) => body.includes(`@${u.name}`)).map((u) => u.id))];
}
