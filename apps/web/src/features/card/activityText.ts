import { PRIORITY_LABEL, type ActivityDTO, type Priority } from '@nexus/shared';

const FIELD_LABEL: Record<string, string> = {
  title: 'judul',
  description: 'deskripsi',
  priority: 'prioritas',
  dueDate: 'tenggat',
  name: 'nama',
  color: 'warna',
  isPrivate: 'visibilitas',
};

type Change = { from?: unknown; to?: unknown };

function isChange(value: unknown): value is Change {
  return typeof value === 'object' && value !== null && ('from' in value || 'to' in value);
}

function describeUpdate(diff: Record<string, unknown>): string {
  const fields = Object.keys(diff);
  if (fields.length === 1 && fields[0] === 'priority' && isChange(diff.priority)) {
    const to = diff.priority.to as Priority | undefined;
    return `mengubah prioritas menjadi ${to ? PRIORITY_LABEL[to] : '-'}`;
  }
  if (fields.length === 1 && fields[0] === 'title' && isChange(diff.title)) {
    return `mengubah judul menjadi "${String(diff.title.to ?? '')}"`;
  }
  const names = fields.map((f) => FIELD_LABEL[f] ?? f);
  return `memperbarui ${names.join(', ')}`;
}

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/** Human-readable Indonesian sentence (without the actor name) for an activity entry. */
export function activitySentence(a: ActivityDTO): string {
  const d = a.diff;
  switch (a.action) {
    case 'card.created':
      return `membuat kartu "${String(d.title ?? '')}"`;
    case 'card.updated':
      return describeUpdate(d);
    case 'card.completed':
      return 'menandai kartu selesai';
    case 'card.reopened':
      return 'membuka kembali kartu';
    case 'card.moved': {
      const list = isChange(d.list) ? d.list : {};
      return list.to ? `memindahkan kartu dari ${String(list.from)} ke ${String(list.to)}` : 'mengubah urutan kartu';
    }
    case 'card.assignees_changed': {
      const added = count(d.added);
      const removed = count(d.removed);
      if (added && removed) return `menambah ${added} dan menghapus ${removed} assignee`;
      return added ? `menambahkan ${added} assignee` : `menghapus ${removed} assignee`;
    }
    case 'card.labels_changed': {
      const labels = Array.isArray(d.labels) ? d.labels.map(String) : [];
      return labels.length ? `mengubah label menjadi ${labels.join(', ')}` : 'menghapus semua label';
    }
    case 'card.archived':
      return `mengarsipkan kartu "${String(d.title ?? '')}"`;
    case 'card.restored':
      return `memulihkan kartu "${String(d.title ?? '')}"`;
    case 'list.created':
      return `membuat kolom "${String(d.name ?? '')}"`;
    case 'list.renamed':
      return isChange(d.name) ? `mengganti nama kolom menjadi "${String(d.name.to)}"` : 'mengganti nama kolom';
    case 'list.archived':
      return 'mengarsipkan kolom';
    case 'list.restored':
      return 'memulihkan kolom';
    case 'project.created':
      return 'membuat proyek';
    case 'project.updated':
      return describeUpdate(d);
    case 'project.archived':
      return 'mengarsipkan proyek';
    case 'project.restored':
      return 'memulihkan proyek';
    case 'member.added':
      return 'menambahkan anggota proyek';
    case 'member.removed':
      return 'menghapus anggota proyek';
    case 'comment.created':
      return 'menambahkan komentar';
    case 'comment.deleted':
      return 'menghapus komentar';
    case 'checklist.created':
      return `menambahkan checklist "${String(d.title ?? '')}"`;
    case 'checklist.checked':
      return `menyelesaikan checklist "${String(d.title ?? '')}"`;
    case 'checklist.unchecked':
      return `membuka kembali checklist "${String(d.title ?? '')}"`;
    case 'checklist.deleted':
      return `menghapus checklist "${String(d.title ?? '')}"`;
    case 'attachment.uploaded':
      return `melampirkan ${String(d.fileName ?? 'file')}`;
    case 'attachment.deleted':
      return `menghapus lampiran ${String(d.fileName ?? '')}`;
    default:
      return a.action.replace('.', ' ').replace(/_/g, ' ');
  }
}
