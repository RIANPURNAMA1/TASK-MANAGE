import { useEffect } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import clsx from 'clsx';
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered, Quote, Strikethrough } from 'lucide-react';

/**
 * Controlled rich-text field for the announcement composer: always shows its toolbar
 * and reports HTML on every change. The server sanitizes the HTML before storing it.
 */
export function RichEditor({
  value,
  onChange,
  placeholder,
  invalid,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: placeholder ?? 'Tulis isi pengumuman…' }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
  });

  // External resets (e.g. opening the editor for another announcement).
  useEffect(() => {
    if (editor && !editor.isFocused && value !== editor.getHTML() && !(value === '' && editor.isEmpty)) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-xl border bg-surface transition-[border-color,box-shadow] focus-within:ring-2',
        invalid ? 'border-danger focus-within:ring-danger/20' : 'border-line focus-within:border-line-focus focus-within:ring-brand-subtle',
      )}
    >
      {editor && <Toolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className="prose-nexus max-h-[45vh] min-h-[180px] overflow-y-auto px-4 py-3 text-[0.875rem] leading-relaxed [&_.ProseMirror]:min-h-[156px] [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const addLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Tautan (https://…)', previous ?? 'https://');
    if (url === null) return;
    if (url === '' || url === 'https://') editor.chain().focus().unsetLink().run();
    else if (/^https?:\/\//i.test(url)) editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  const groups = [
    [
      { label: 'Judul', icon: Heading2, active: () => editor.isActive('heading', { level: 2 }), run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    ],
    [
      { label: 'Tebal (Ctrl+B)', icon: Bold, active: () => editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
      { label: 'Miring (Ctrl+I)', icon: Italic, active: () => editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
      { label: 'Coret', icon: Strikethrough, active: () => editor.isActive('strike'), run: () => editor.chain().focus().toggleStrike().run() },
      { label: 'Tautan', icon: Link2, active: () => editor.isActive('link'), run: addLink },
    ],
    [
      { label: 'Daftar berpoin', icon: List, active: () => editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
      { label: 'Daftar bernomor', icon: ListOrdered, active: () => editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
      { label: 'Kutipan', icon: Quote, active: () => editor.isActive('blockquote'), run: () => editor.chain().focus().toggleBlockquote().run() },
      { label: 'Blok kode', icon: Code, active: () => editor.isActive('codeBlock'), run: () => editor.chain().focus().toggleCodeBlock().run() },
    ],
  ];

  return (
    <div role="toolbar" aria-label="Format teks" className="flex flex-wrap items-center gap-0.5 border-b border-line-subtle bg-canvas/60 px-2 py-1.5">
      {groups.map((group, gi) => (
        <div key={gi} className="flex items-center gap-0.5">
          {gi > 0 && <span className="mx-1 h-5 w-px bg-line" aria-hidden />}
          {group.map(({ label, icon: Icon, active, run }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={active()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              className={clsx(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                active() ? 'bg-brand text-white' : 'text-ink-muted hover:bg-canvas-deep hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
