'use client'

import clsx from 'clsx'
import { CheckCircle2, Hourglass } from 'lucide-react'
import { allowedMoves, type Actor } from '@/lib/task-status'
import { formatDateTime, formatDuration } from '@/lib/format'
import type { TaskStatus } from '@/types'

interface ActionableTask {
  status: TaskStatus
  startedAt?: string
  completedAt?: string
}

interface TaskActionsProps {
  task: ActionableTask
  /** `leader` = project owner / team leader (reviews); `developer` = the assignee. */
  actor: Actor
  busy?: boolean
  onMove: (status: TaskStatus) => void
  className?: string
}

interface Action {
  to: TaskStatus
  label: string
  primary?: boolean
}

/** The button for each legal move. The wording is the workflow: Start → Submit for Review → Complete / Send Back. */
const LABELS: Record<string, Action> = {
  'todo>in-progress': { to: 'in-progress', label: 'Start Task', primary: true },
  'in-progress>review': { to: 'review', label: 'Submit for Review', primary: true },
  'in-progress>todo': { to: 'todo', label: 'Move back to To Do' },
  'review>complete': { to: 'complete', label: 'Complete', primary: true },
  'review>in-progress': { to: 'in-progress', label: 'Send Back' },
  'complete>in-progress': { to: 'in-progress', label: 'Reopen' },
}

/**
 * The one place that turns a task's status into the buttons a person may press.
 * It only decides what to offer; the server enforces every move.
 */
export function TaskActions({ task, actor, busy, onMove, className }: TaskActionsProps) {
  const actions = allowedMoves(actor, task.status)
    .map((to) => LABELS[`${task.status}>${to}`])
    .filter(Boolean)

  const elapsed = formatDuration(task.startedAt, task.completedAt)

  return (
    <div className={clsx('flex flex-wrap items-center gap-1.5', className)}>
      {actor === 'developer' && task.status === 'review' && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent-subtle px-2.5 py-1.5 text-xs font-medium text-accent-strong">
          <Hourglass className="h-3.5 w-3.5" />
          Waiting for Team Leader review
        </span>
      )}

      {task.status === 'complete' && (
        <span className="inline-flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
          <CheckCircle2 className="h-3.5 w-3.5 text-positive" />
          <span className="font-medium text-positive-strong">Completed</span>
          {task.completedAt && <span>{formatDateTime(task.completedAt)}</span>}
          {elapsed && <span>· Elapsed {elapsed}</span>}
        </span>
      )}

      {actions.map(({ to, label, primary }) => (
        <button
          key={to + label}
          type="button"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            onMove(to)
          }}
          className={clsx(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:cursor-wait disabled:opacity-60',
            primary
              ? 'bg-interactive text-on-brand hover:bg-interactive-hover'
              : 'border border-hairline bg-surface text-ink-soft hover:bg-surface-sunken'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
