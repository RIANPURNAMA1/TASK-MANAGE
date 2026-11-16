import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { CheckSquare, FolderKanban, LayoutDashboard, LayoutGrid, Megaphone, Search, Settings } from 'lucide-react';
import { useProjectsQuery } from '../../features/projects/hooks';
import { useUiStore } from '../../stores/ui';
import { Modal } from '../ui';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  color?: string;
  to: string;
}

const STATIC: Command[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard />, to: '/dashboard' },
  { id: 'my-tasks', label: 'My Tasks', icon: <CheckSquare />, to: '/my-tasks' },
  { id: 'announcements', label: 'Pengumuman', icon: <Megaphone />, to: '/announcements' },
  { id: 'divisions', label: 'Divisi & Proyek', icon: <LayoutGrid />, to: '/divisions' },
  { id: 'settings', label: 'Pengaturan akun', icon: <Settings />, to: '/settings' },
];

/** Ctrl/Cmd+K quick switcher for projects and pages. */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandPaletteOpen);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);

  return (
    <Modal open={open} onClose={() => setOpen(false)} size="md" bare>
      <PaletteBody onDone={() => setOpen(false)} />
    </Modal>
  );
}

function PaletteBody({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const projects = useProjectsQuery();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const commands = useMemo(() => {
    const projectCommands: Command[] = (projects.data ?? []).map((p) => ({
      id: p.id,
      label: p.name,
      hint: p.divisionName,
      icon: <FolderKanban />,
      color: p.color,
      to: `/projects/${p.id}`,
    }));
    const q = query.trim().toLowerCase();
    return [...projectCommands, ...STATIC].filter(
      (c) => !q || c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q),
    );
  }, [projects.data, query]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    navigate(command.to);
    onDone();
  };

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-line-subtle px-4">
        <Search className="h-4 w-4 text-ink-subtle" />
        <input
          autoFocus
          value={query}
          placeholder="Cari proyek atau halaman…"
          aria-label="Cari proyek atau halaman"
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, commands.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              run(commands[active]);
            }
          }}
          className="h-12 flex-1 bg-transparent text-body outline-none placeholder:text-ink-subtle"
        />
      </div>
      <ul className="max-h-80 overflow-y-auto p-1.5" role="listbox">
        {commands.length === 0 && <li className="px-3 py-6 text-center text-ink-subtle">Tidak ditemukan.</li>}
        {commands.map((c, i) => (
          <li key={c.id} role="option" aria-selected={i === active}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left [&>svg]:h-4 [&>svg]:w-4',
                i === active ? 'bg-brand-subtle text-brand' : 'text-ink',
              )}
            >
              {c.color ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} /> : c.icon}
              <span className="flex-1 font-medium">{c.label}</span>
              {c.hint && <span className="text-caption text-ink-subtle">{c.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
