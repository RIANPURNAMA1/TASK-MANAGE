import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import type { MyTaskDTO } from '@nexus/shared';
import { AvatarStack } from '../../components/ui';
import { ProjectGlyph } from '../../components/layout/ProjectSidebar';
import { dueStatus } from '../../lib/format';
import { PriorityIcon } from '../board/CardBits';

/** Detailed single-line task, used by the Agenda view and the selected-day panel. */
export function TaskRow({ task, onOpen }: { task: MyTaskDTO; onOpen: (task: MyTaskDTO) => void }) {
  const status = dueStatus(task.dueDate, task.completedAt);
  const done = status === 'done' || Boolean(task.completedAt);
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-canvas-deep"
    >
      <span className="w-11 shrink-0 text-[0.75rem] tabular-nums text-ink-subtle">
        {task.dueDate ? format(parseISO(task.dueDate), 'HH:mm') : ''}
      </span>
      <ProjectGlyph color={task.project.color} />
      <span className="min-w-0 flex-1">
        <span
          className={clsx(
            'block truncate text-[0.875rem]',
            done ? 'text-ink-subtle line-through' : status === 'overdue' ? 'font-medium text-danger-ink' : 'font-medium text-ink',
          )}
        >
          {task.title}
        </span>
        <span className="block truncate text-caption text-ink-subtle">
          {task.project.name} · {task.list.name}
          {task.startDate && <span className="ml-1.5">· Mulai {format(parseISO(task.startDate), 'd MMM', { locale: localeId })}</span>}
          {status === 'overdue' && <span className="ml-1.5 font-medium text-danger-ink">Terlambat</span>}
        </span>
      </span>
      <PriorityIcon priority={task.priority} />
      {task.assignees.length > 0 && <AvatarStack users={task.assignees} max={3} size="sm" />}
    </button>
  );
}
