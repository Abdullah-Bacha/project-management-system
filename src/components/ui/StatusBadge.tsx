import clsx from 'clsx'
import { TASK_STATUS_LABELS } from '@/lib/task-status'
import type { ProjectStatus, TaskPriority, TaskStatus } from '@/types'

/**
 * The one place project / task / priority colours are defined, so a status
 * looks the same on the dashboard, the board, the project cards and the task
 * panel. Only values that exist in the data model are listed.
 */
const PROJECT_STATUS: Record<ProjectStatus, string> = {
  active: 'bg-positive-subtle text-positive-strong',
  completed: 'bg-info-subtle text-info-strong',
  archived: 'bg-surface-sunken text-ink-muted',
}

const TASK_STATUS: Record<TaskStatus, string> = {
  todo: 'bg-surface-sunken text-ink-muted',
  'in-progress': 'bg-brand-50 text-brand-700',
  review: 'bg-accent-subtle text-accent-strong',
  complete: 'bg-positive-subtle text-positive-strong',
}

export const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: 'bg-surface-sunken text-ink-muted',
  medium: 'bg-brand-50 text-brand-700',
  high: 'bg-caution-subtle text-caution-strong',
  urgent: 'bg-critical-subtle text-critical-strong',
}

const base = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize whitespace-nowrap'

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return <span className={clsx(base, PROJECT_STATUS[status], className)}>{status}</span>
}

export function TaskStatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  return <span className={clsx(base, TASK_STATUS[status], className)}>{TASK_STATUS_LABELS[status]}</span>
}

export function PriorityBadge({ priority, className }: { priority: TaskPriority; className?: string }) {
  return <span className={clsx(base, PRIORITY_BADGE[priority], className)}>{priority}</span>
}
