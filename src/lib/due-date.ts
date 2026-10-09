import type { TaskStatus } from '@/types'

/**
 * Task due dates are CALENDAR DATES, not moments in time.
 *
 * Storage: the task's `dueDate` is a Date at 00:00 UTC of the chosen day (what
 * `new Date('2026-10-10')` already gives, and what existing tasks hold).
 * Everything here reads the day back from its UTC parts, so "10 Oct" stays
 * "10 Oct" for every viewer, whatever their timezone. "Today" is the viewer's
 * own local calendar date, compared as a plain `YYYY-MM-DD` string, so there is
 * no clock arithmetic to drift across midnight.
 */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** True for a real calendar day written as YYYY-MM-DD (rejects 2026-02-30 and the like). */
export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/**
 * The stored due date for what a client sent: `YYYY-MM-DD`, or a full ISO
 * timestamp (reduced to its UTC day). Anything else is not a date.
 */
export function parseDueDate(value: string): Date | null {
  const text = value.trim()
  if (isValidDateOnly(text)) return new Date(`${text}T00:00:00Z`)
  if (/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(text)) {
    const d = new Date(text)
    if (!Number.isNaN(d.getTime())) return new Date(`${d.toISOString().slice(0, 10)}T00:00:00Z`)
  }
  return null
}

/** The calendar day of a stored due date, as YYYY-MM-DD (empty when there is none). */
export function dateOnly(value?: string | Date | null): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** The viewer's own calendar date today, as YYYY-MM-DD. */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** "Oct 12, 2026" — the day as chosen, never shifted by timezone. */
export function formatDueDate(value?: string | Date | null): string {
  const day = dateOnly(value)
  if (!day) return ''
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Where a task stands against its deadline. Derived, never stored.
 * A finished task is just `COMPLETED`: its date is still shown, but it is
 * never active overdue work.
 */
export type DeadlineState = 'NO_DUE_DATE' | 'UPCOMING' | 'DUE_TODAY' | 'OVERDUE' | 'COMPLETED'

export function deadlineState(
  dueDate: string | Date | null | undefined,
  status: TaskStatus,
  today: string = localToday()
): DeadlineState {
  const day = dateOnly(dueDate)
  if (!day) return 'NO_DUE_DATE'
  if (status === 'complete') return 'COMPLETED'
  if (day < today) return 'OVERDUE'
  if (day === today) return 'DUE_TODAY'
  return 'UPCOMING'
}

/** The due-date filter choices of the task lists. */
export const DUE_FILTERS = ['overdue', 'today', 'upcoming', 'none'] as const
export type DueFilter = (typeof DUE_FILTERS)[number]

export const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Upcoming',
  none: 'No due date',
}

/** Midnight UTC at the start of a calendar day (`today` is the viewer's date; the server's UTC date when absent). */
export function dayStartUTC(today?: string): Date {
  const day = today && isValidDateOnly(today) ? today : new Date().toISOString().slice(0, 10)
  return new Date(`${day}T00:00:00Z`)
}
