'use client'

import clsx from 'clsx'
import { Lock, UserRound } from 'lucide-react'
import { Task } from '@/types'
import { PriorityBadge } from '@/components/ui/StatusBadge'
import { formatDateTime } from '@/lib/format'
import { DueDate } from '@/components/ui/DueDate'

interface TaskCardProps {
  task: Task
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
}

const priorityRail: Record<Task['priority'], string> = {
  low: 'bg-ink-faint',
  medium: 'bg-brand-500',
  high: 'bg-caution',
  urgent: 'bg-critical',
}

export function TaskCard({
  task,
  onClick,
  draggable = false,
  onDragStart,
}: TaskCardProps) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      className={clsx(
        'group relative overflow-hidden rounded-xl border border-hairline bg-surface p-3.5',
        'shadow-card transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lifted',
        onClick && 'cursor-pointer'
      )}
    >
      {/* Priority rail on the leading edge */}
      <span
        className={clsx(
          'absolute inset-y-0 left-0 w-0.5 transition-all duration-200 group-hover:w-1',
          priorityRail[task.priority]
        )}
      />

      <h4 className="line-clamp-2 pl-1.5 text-sm font-medium leading-snug text-ink">
        {task.title}
      </h4>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-1.5">
        <PriorityBadge priority={task.priority} />

        <DueDate dueDate={task.dueDate} status={task.status} />

        {(task.openBlockers ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-caution-subtle px-2 py-0.5 text-[11px] font-medium text-caution-strong">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {task.openBlockers} {task.openBlockers === 1 ? 'blocker' : 'blockers'}
            <span className="sr-only"> (blocked, status unchanged)</span>
          </span>
        )}

        {task.assignedTo && (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            <UserRound className="h-3 w-3" />
            {task.assignedTo.name?.split(' ')[0] ?? 'Assigned'}
          </span>
        )}
      </div>

      {task.status === 'in-progress' && task.startedAt && (
        <p className="mt-2 pl-1.5 text-[11px] text-ink-muted">Started {formatDateTime(task.startedAt)}</p>
      )}

      {task.tags && task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 pl-1.5">
          {task.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="text-[11px] text-ink-faint">
              #{tag}
            </span>
          ))}
          {task.tags.length > 2 && (
            <span className="text-[11px] text-ink-faint">
              +{task.tags.length - 2}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
