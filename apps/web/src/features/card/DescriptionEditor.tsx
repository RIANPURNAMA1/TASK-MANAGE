import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import clsx from 'clsx';
import { Bold, Code, Italic, List, ListOrdered, Quote, Strikethrough } from 'lucide-react';

const EMPTY_HTML = '<p></p>';

/**
 * Rich-text description (FR-09). Saves on blur when the content changed.
 * The server sanitizes HTML before storing it, so we can render it as-is.
 */
export function DescriptionEditor({
  value,
  editable,
  onSave,
}: {
  value: string | null;
  editable: boolean;
  onSave: (html: string | null) => void;
}) {
  const lastSaved = useRef(value ?? '');
  const [focused, setFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: !editable, autolink: true }),
      Placeholder.configure({ placeholder: 'Tambahkan deskripsi yang lebih detail…' }),
    ],
    content: value ?? '',
    editable,
    onFocus: () => setFocused(true),
    onBlur: ({ editor: e }) => {
      setFocused(false);
      const html = e.isEmpty ? '' : e.getHTML();
      if (html === lastSaved.current) return;
      lastSaved.current = html;
      onSave(html && html !== EMPTY_HTML ? html : null);
    },
  });

  // Accept remote updates when the user isn't typing.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const next = value ?? '';
    if (next !== lastSaved.current) {
      lastSaved.current = next;
      editor.commands.setContent(next, false);
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  return (
    // Reads like plain text until focused; the formatting toolbar only appears while editing.
    <div
      className={clsx(
        'rounded-2xl border transition-[border-color,box-shadow,background-color]',
        focused
          ? 'border-brand-border bg-surface ring-4 ring-brand-subtle'
          : clsx('border-transparent', editable && 'cursor-text hover:bg-canvas'),
      )}
    >
      <EditorContent editor={editor} className="prose-nexus px-3.5 py-2.5 text-[0.875rem] leading-relaxed" />
      {/* Below the text, so it appearing on focus never shifts what the user just clicked. */}
      {editable && editor && focused && <Toolbar editor={editor} />}
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const items = [
    { label: 'Tebal', icon: Bold, active: 'bold', run: () => editor.chain().focus().toggleBold().run() },
    { label: 'Miring', icon: Italic, active: 'italic', run: () => editor.chain().focus().toggleItalic().run() },
    { label: 'Coret', icon: Strikethrough, active: 'strike', run: () => editor.chain().focus().toggleStrike().run() },
    { label: 'Daftar', icon: List, active: 'bulletList', run: () => editor.chain().focus().toggleBulletList().run() },
    { label: 'Daftar bernomor', icon: ListOrdered, active: 'orderedList', run: () => editor.chain().focus().toggleOrderedList().run() },
    { label: 'Kutipan', icon: Quote, active: 'blockquote', run: () => editor.chain().focus().toggleBlockquote().run() },
    { label: 'Kode', icon: Code, active: 'codeBlock', run: () => editor.chain().focus().toggleCodeBlock().run() },
  ];
  return (
    <div className="flex gap-0.5 border-t border-line-subtle px-2 py-1.5">
      {items.map(({ label, icon: Icon, active, run }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          title={label}
          // Keep focus in the editor so clicking the toolbar doesn't trigger a save-on-blur.
          onMouseDown={(e) => e.preventDefault()}
          onClick={run}
          className={clsx(
            'rounded-lg p-1.5 transition-colors hover:bg-canvas-deep',
            editor.isActive(active) ? 'bg-brand-subtle text-brand' : 'text-ink-muted',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
