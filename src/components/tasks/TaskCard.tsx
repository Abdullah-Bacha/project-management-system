'use client'

import clsx from 'clsx'
import { AlertTriangle, CalendarClock, UserRound } from 'lucide-react'
import { Task } from '@/types'

interface TaskCardProps {
  task: Task
  onClick?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
}

const priorityStyles: Record<Task['priority'], string> = {
  low: 'bg-surface-sunken text-ink-muted',
  medium: 'bg-brand-50 text-brand-600',
  high: 'bg-caution/12 text-caution',
  urgent: 'bg-critical/12 text-critical',
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
  const daysUntilDue = task.dueDate
    ? Math.ceil(
        (new Date(task.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      )
    : null

  const isOverdue = daysUntilDue !== null && daysUntilDue < 0

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
        <span
          className={clsx(
            'rounded-md px-2 py-0.5 text-[11px] font-medium capitalize',
            priorityStyles[task.priority]
          )}
        >
          {task.priority}
        </span>

        {task.dueDate && (
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium',
              isOverdue
                ? 'bg-critical/12 text-critical'
                : 'bg-surface-sunken text-ink-muted'
            )}
          >
            {isOverdue ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <CalendarClock className="h-3 w-3" />
            )}
            {isOverdue
              ? `${Math.abs(daysUntilDue!)}d overdue`
              : daysUntilDue === 0
                ? 'Due today'
                : `${daysUntilDue}d left`}
          </span>
        )}

        {task.assignedTo && (
          <span className="inline-flex items-center gap-1 rounded-md bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-ink-muted">
            <UserRound className="h-3 w-3" />
            Assigned
          </span>
        )}
      </div>

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
