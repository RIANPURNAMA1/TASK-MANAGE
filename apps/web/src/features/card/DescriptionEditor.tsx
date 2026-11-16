import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import { Color } from '@tiptap/extension-color';
import TextStyle from '@tiptap/extension-text-style';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import clsx from 'clsx';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  type LucideIcon,
} from 'lucide-react';

const EMPTY_HTML = '<p></p>';

/**
 * Rich-text description (FR-09), Notion-style. Saves on blur when the content changed.
 *
 * Pasted content keeps its structure — headings (H1–H3), bold/italic/underline, text color and
 * highlight, lists, checklists, tables with borders, code blocks and dividers — because the
 * editor schema below covers them. The server sanitizes HTML before storing it
 * (apps/api/src/lib/sanitize.ts); keep its allow-list in sync with these extensions.
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
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
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

interface ToolbarItem {
  label: string;
  icon: LucideIcon;
  /** Node/mark name, optionally with attributes, used to highlight the active state. */
  active: string | [string, Record<string, unknown>];
  run: () => void;
}

function Toolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus();
  const groups: ToolbarItem[][] = [
    [
      { label: 'Judul 1', icon: Heading1, active: ['heading', { level: 1 }], run: () => chain().toggleHeading({ level: 1 }).run() },
      { label: 'Judul 2', icon: Heading2, active: ['heading', { level: 2 }], run: () => chain().toggleHeading({ level: 2 }).run() },
      { label: 'Judul 3', icon: Heading3, active: ['heading', { level: 3 }], run: () => chain().toggleHeading({ level: 3 }).run() },
    ],
    [
      { label: 'Tebal', icon: Bold, active: 'bold', run: () => chain().toggleBold().run() },
      { label: 'Miring', icon: Italic, active: 'italic', run: () => chain().toggleItalic().run() },
      { label: 'Garis bawah', icon: UnderlineIcon, active: 'underline', run: () => chain().toggleUnderline().run() },
      { label: 'Coret', icon: Strikethrough, active: 'strike', run: () => chain().toggleStrike().run() },
      { label: 'Sorot', icon: Highlighter, active: 'highlight', run: () => chain().toggleHighlight({ color: '#fef08a' }).run() },
    ],
    [
      { label: 'Daftar', icon: List, active: 'bulletList', run: () => chain().toggleBulletList().run() },
      { label: 'Daftar bernomor', icon: ListOrdered, active: 'orderedList', run: () => chain().toggleOrderedList().run() },
      { label: 'Daftar centang', icon: ListChecks, active: 'taskList', run: () => chain().toggleTaskList().run() },
    ],
    [
      { label: 'Kutipan', icon: Quote, active: 'blockquote', run: () => chain().toggleBlockquote().run() },
      { label: 'Kode', icon: Code, active: 'codeBlock', run: () => chain().toggleCodeBlock().run() },
      {
        label: 'Tabel',
        icon: TableIcon,
        active: 'table',
        run: () => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      },
      { label: 'Garis pemisah', icon: Minus, active: 'horizontalRule', run: () => chain().setHorizontalRule().run() },
    ],
  ];

  const tableActions = [
    { label: '+ Baris', run: () => chain().addRowAfter().run() },
    { label: '+ Kolom', run: () => chain().addColumnAfter().run() },
    { label: '− Baris', run: () => chain().deleteRow().run() },
    { label: '− Kolom', run: () => chain().deleteColumn().run() },
    { label: 'Hapus tabel', run: () => chain().deleteTable().run() },
  ];

  return (
    <div className="border-t border-line-subtle px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-y-1">
        {groups.map((group, gi) => (
          <div key={gi} className={clsx('flex items-center gap-0.5', gi > 0 && 'ml-1.5 border-l border-line-subtle pl-1.5')}>
            {group.map(({ label, icon: Icon, active, run }) => {
              const isActive = Array.isArray(active) ? editor.isActive(active[0], active[1]) : editor.isActive(active);
              return (
                <button
                  key={label}
                  type="button"
                  aria-label={label}
                  aria-pressed={isActive}
                  title={label}
                  // Keep focus in the editor so clicking the toolbar doesn't trigger a save-on-blur.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={run}
                  className={clsx(
                    'rounded-lg p-1.5 transition-colors hover:bg-canvas-deep',
                    isActive ? 'bg-brand-subtle text-brand' : 'text-ink-muted',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {editor.isActive('table') && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 border-t border-line-subtle pt-1.5">
          <span className="mr-1 text-caption text-ink-subtle">Tabel:</span>
          {tableActions.map(({ label, run }) => (
            <button
              key={label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              className={clsx(
                'rounded-lg px-2 py-1 text-caption font-medium transition-colors hover:bg-canvas-deep',
                label === 'Hapus tabel' ? 'text-danger-ink' : 'text-ink-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
