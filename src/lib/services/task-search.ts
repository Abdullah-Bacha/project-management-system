import { z } from 'zod'
import { objectIdString } from '@/lib/validation'
import { TASK_SEARCH_MAX } from '@/lib/task-filters'
import { DUE_FILTERS, dayStartUTC, isValidDateOnly, parseDueDate, type DueFilter } from '@/lib/due-date'

/**
 * The search / filter query parameters of the task lists. Only these strings
 * are accepted, and each becomes a fixed part of the query below, so a caller
 * can never pass their own MongoDB operators.
 */
export const taskSearchShape = {
  q: z.string().trim().max(TASK_SEARCH_MAX, `Search is limited to ${TASK_SEARCH_MAX} characters`).optional(),
  assigneeId: objectIdString.optional(),
  createdBy: objectIdString.optional(),
  due: z.enum(DUE_FILTERS).optional(),
  /** The viewer's local calendar date (YYYY-MM-DD): what "today" means for the due filter. */
  today: z.string().refine(isValidDateOnly, 'Invalid date').optional(),
}

/** A due date sent by a client: a real calendar day, stored as that day at 00:00 UTC. Invalid values are a 400. */
export const dueDateInput = z
  .string()
  .refine((value) => parseDueDate(value) !== null, 'Invalid date')
  .transform((value) => parseDueDate(value) as Date)

type Query = Record<string, unknown>

const escapeRegex = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Case-insensitive "contains" over the task's title and description. The text is literal, never a pattern. */
export function textFilter(q?: string): Query {
  const text = q?.trim()
  if (!text) return {}
  const pattern = new RegExp(escapeRegex(text), 'i')
  return { $or: [{ title: pattern }, { description: pattern }] }
}

/**
 * The due-date filter. Overdue, due today and upcoming only ever concern work
 * that is still open (a finished task is never overdue); "none" is any task
 * without a date. `today` is the viewer's calendar date, defaulting to the
 * server's UTC date.
 */
export function dueFilter(due?: DueFilter, today?: string): Query {
  if (!due) return {}
  if (due === 'none') return { dueDate: null }

  const start = dayStartUTC(today)
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  const open = { status: { $ne: 'complete' } }

  if (due === 'overdue') return { dueDate: { $lt: start }, ...open }
  if (due === 'today') return { dueDate: { $gte: start, $lt: next }, ...open }
  return { dueDate: { $gte: next }, ...open }
}

/** The extra conditions a task list adds on top of its own access rules. */
export function taskSearchFilter(params: {
  q?: string
  assigneeId?: string
  createdBy?: string
  due?: DueFilter
  today?: string
}): Query {
  return {
    ...textFilter(params.q),
    ...dueFilter(params.due, params.today),
    ...(params.assigneeId && { assignedTo: params.assigneeId }),
    ...(params.createdBy && { createdBy: params.createdBy }),
  }
}

/**
 * AND the non-empty parts together. A caller's own restriction (a developer
 * sees only their tasks) is one part; search and filters are others — so a
 * filter can only ever narrow what the caller may already see, never replace
 * the restriction.
 */
export function allOf(...parts: Query[]): Query {
  const present = parts.filter((p) => Object.keys(p).length > 0)
  if (present.length === 0) return {}
  if (present.length === 1) return present[0]
  return { $and: present }
}
