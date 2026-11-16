import clsx from 'clsx';
import { CircleCheck, Circle, MessageCircle, Paperclip } from 'lucide-react';
import { AvatarStack, Badge, type Tone } from '../../components/ui';

/**
 * Decorative product preview for the auth split layout: a miniature Kanban
 * board built from the same tokens/components as the real app. Purely visual.
 */

interface PreviewCard {
  tags: { label: string; tone: Tone }[];
  title: string;
  description?: string;
  subtasks?: { label: string; done: boolean }[];
  people: string[];
  comments: number;
  files: number;
}

const columns: { title: string; dot: string; count: number; cards: PreviewCard[] }[] = [
  {
    title: 'Baru',
    dot: 'bg-danger',
    count: 6,
    cards: [
      {
        tags: [
          { label: 'Website', tone: 'brand' },
          { label: 'Desain', tone: 'success' },
        ],
        title: 'Halaman "Tentang" & "Karier"',
        description: 'Detail lengkap ada di brief, siap dikerjakan.',
        subtasks: [
          { label: 'Wireframe', done: true },
          { label: 'Copywriting', done: false },
        ],
        people: ['Rina Hartono', 'Dimas Putra'],
        comments: 8,
        files: 2,
      },
    ],
  },
  {
    title: 'Dikerjakan',
    dot: 'bg-warning',
    count: 3,
    cards: [
      {
        tags: [
          { label: 'Marketing', tone: 'warning' },
          { label: 'Riset', tone: 'danger' },
        ],
        title: 'Riset kompetitor Q4',
        description: 'Identifikasi kekuatan dan kelemahan tiap pesaing.',
        people: ['Sari Wulandari', 'Bayu Aditya', 'Fajar N'],
        comments: 12,
        files: 4,
      },
    ],
  },
  {
    title: 'Selesai',
    dot: 'bg-success',
    count: 7,
    cards: [
      {
        tags: [{ label: 'Mobile', tone: 'info' }],
        title: 'Rilis aplikasi iOS v2.1',
        subtasks: [
          { label: 'QA regresi', done: true },
          { label: 'Submit App Store', done: true },
        ],
        people: ['Andi Saputra'],
        comments: 5,
        files: 1,
      },
    ],
  },
];

function PreviewKanbanCard({ card, className }: { card: PreviewCard; className?: string }) {
  const done = card.subtasks?.filter((s) => s.done).length ?? 0;
  return (
    <div className={clsx('rounded-kanban border border-line bg-surface p-3 shadow-card', className)}>
      <div className="flex flex-wrap gap-1">
        {card.tags.map((tag) => (
          <Badge key={tag.label} tone={tag.tone} className="!text-[10px]">
            {tag.label}
          </Badge>
        ))}
      </div>
      <p className="mt-2 text-body font-semibold text-ink">{card.title}</p>
      {card.description && <p className="mt-0.5 text-caption text-ink-muted">{card.description}</p>}
      {card.subtasks && (
        <div className="mt-2 space-y-1">
          {card.subtasks.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-caption text-ink-muted">
              {s.done ? (
                <CircleCheck className="h-3.5 w-3.5 text-success" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-line-strong" />
              )}
              <span className={clsx(s.done && 'text-ink-subtle line-through')}>{s.label}</span>
            </div>
          ))}
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-canvas-deep">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(done / card.subtasks.length) * 100}%` }}
            />
          </div>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-line-subtle pt-2.5">
        <AvatarStack users={card.people.map((name) => ({ id: name, name, avatarUrl: null }))} />
        <div className="flex items-center gap-2.5 text-caption text-ink-subtle">
          <span className="inline-flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {card.comments}
          </span>
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3.5 w-3.5" />
            {card.files}
          </span>
        </div>
      </div>
    </div>
  );
}

export function AuthShowcase() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-modal border border-line bg-canvas-deep">
      {/* Soft dot grid background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
          backgroundSize: '18px 18px',
          maskImage: 'linear-gradient(to bottom, black, transparent 85%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black, transparent 85%)',
        }}
      />

      <div className="relative px-10 pt-10">
        <Badge tone="brand">Ruang kerja multi-divisi</Badge>
        <h2 className="mt-4 max-w-md text-[1.75rem] font-bold leading-tight tracking-[-0.02em] text-ink">
          Semua tugas, diskusi, dan file tim dalam satu papan.
        </h2>
        <p className="mt-2 max-w-md text-body text-ink-muted">
          Pantau progres lintas divisi secara real-time, dari permintaan baru hingga selesai.
        </p>
      </div>

      {/* Mini board */}
      <div className="relative mt-8 flex-1 px-10 pb-10">
        <div className="rounded-xl border border-line bg-surface/70 p-3 shadow-card-hover backdrop-blur">
          <div className="mb-3 flex items-center gap-1 border-b border-line-subtle px-1 pb-2.5">
            {['Kanban', 'Tabel', 'Timeline'].map((tab, i) => (
              <span
                key={tab}
                className={clsx(
                  'rounded-lg px-2.5 py-1 text-caption font-medium',
                  i === 0 ? 'bg-brand-subtle text-brand' : 'text-ink-subtle',
                )}
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {columns.map((col) => (
              <div key={col.title} className="min-w-0 space-y-2">
                <div className="flex items-center gap-1.5 px-1 text-caption font-medium text-ink">
                  <span className={clsx('h-1.5 w-1.5 rounded-full', col.dot)} />
                  {col.title}
                  <span className="text-ink-subtle">{col.count}</span>
                </div>
                {col.cards.map((card) => (
                  <PreviewKanbanCard key={card.title} card={card} />
                ))}
                <div className="h-14 rounded-kanban border border-dashed border-line bg-canvas/60" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
