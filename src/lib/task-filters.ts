import { localToday, type DueFilter } from '@/lib/due-date'
import type { TaskPriority, TaskStatus } from '@/types'

/** Longest search text the server accepts. */
export const TASK_SEARCH_MAX = 100

/** The task filters shared by the UI and the API's query string. Every field is optional; all combine with AND. */
export interface TaskFilters {
  q?: string
  status?: TaskStatus
  priority?: TaskPriority
  due?: DueFilter
  assigneeId?: string
  createdBy?: string
  /** Only meaningful on the cross-project My Tasks list. */
  projectId?: string
}

const KEYS: (keyof TaskFilters)[] = ['q', 'status', 'priority', 'due', 'assigneeId', 'createdBy', 'projectId']

/** Drop empty values and trim the search text. */
export function cleanFilters(filters: TaskFilters): TaskFilters {
  const out: TaskFilters = {}
  for (const key of KEYS) {
    const value = typeof filters[key] === 'string' ? (filters[key] as string).trim() : ''
    if (value) (out as Record<string, string>)[key] = value
  }
  return out
}

export function hasActiveFilters(filters: TaskFilters): boolean {
  return Object.keys(cleanFilters(filters)).length > 0
}

/** `q=login&status=review`, or an empty string when nothing is set. */
export function filtersToQueryString(filters: TaskFilters, today: string = localToday()): string {
  const params = new URLSearchParams()
  const clean = cleanFilters(filters)
  for (const [key, value] of Object.entries(clean)) params.set(key, value)
  // "Today" for the due filter is the viewer's own calendar date.
  if (clean.due) params.set('today', today)
  return params.toString()
}

/** The one-click shortcuts above the filters. */
export type QuickFilter = 'all' | 'mine' | TaskStatus

/** Which shortcut the current filters amount to (so the right chip lights up). */
export function quickFilterOf(filters: TaskFilters, meId?: string): QuickFilter {
  if (filters.status) return filters.status
  if (meId && filters.assigneeId === meId) return 'mine'
  return 'all'
}

/** The filters after choosing a shortcut. Search text and the other filters are kept. */
export function applyQuickFilter(filters: TaskFilters, quick: QuickFilter, meId?: string): TaskFilters {
  const { status: _status, ...rest } = filters
  if (quick === 'all') return rest.assigneeId === meId ? { ...rest, assigneeId: undefined } : rest
  if (quick === 'mine') return { ...rest, assigneeId: meId }
  return { ...rest, status: quick }
}
