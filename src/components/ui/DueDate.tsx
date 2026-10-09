import clsx from 'clsx'
import { AlertTriangle, CalendarClock, CalendarDays } from 'lucide-react'
import { deadlineState, formatDueDate, type DeadlineState } from '@/lib/due-date'
import type { TaskStatus } from '@/types'

/** One place for how each deadline state looks. */
const STATE_STYLES: Record<DeadlineState, string> = {
  NO_DUE_DATE: '',
  UPCOMING: 'bg-surface-sunken text-ink-muted',
  DUE_TODAY: 'bg-caution-subtle text-caution-strong',
  OVERDUE: 'bg-critical-subtle text-critical-strong',
  COMPLETED: 'text-ink-faint',
}

interface DueDateProps {
  dueDate?: string | null
  status: TaskStatus
  className?: string
}

/**
 * A task's deadline: the day as chosen, plus Overdue / Due today when it is
 * still open work. A finished task keeps its date but is never flagged.
 * Renders nothing when there is no due date.
 */
export function DueDate({ dueDate, status, className }: DueDateProps) {
  const state = deadlineState(dueDate, status)
  if (state === 'NO_DUE_DATE') return null

  const day = formatDueDate(dueDate)
  const label = state === 'OVERDUE' ? `Overdue · ${day}` : state === 'DUE_TODAY' ? 'Due today' : `Due ${day}`
  const Icon = state === 'OVERDUE' ? AlertTriangle : state === 'DUE_TODAY' ? CalendarClock : CalendarDays

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium',
        state !== 'COMPLETED' && 'rounded-md px-2 py-0.5',
        STATE_STYLES[state],
        className
      )}
      title={state === 'COMPLETED' ? `Was due ${day}` : `Due ${day}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}
