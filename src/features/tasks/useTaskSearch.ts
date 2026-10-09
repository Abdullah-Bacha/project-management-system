'use client'

import { useRealtimeData } from '@/hooks/useRealtimeData'
import { filtersToQueryString, type TaskFilters } from '@/lib/task-filters'
import type { Task } from '@/types'

/**
 * The project tasks matching a search / filters. The server applies both the
 * caller's access rule and the filters, so this can only ever hold tasks the
 * caller may already see. It stays live: any task change in the project
 * re-runs the same request, so results never drift from the data.
 */
export function useTaskSearch(projectId: string, filters: TaskFilters) {
  const { data, ...rest } = useRealtimeData<{ tasks: Task[] }>({
    endpoint: `/api/projects/${projectId}/tasks?${filtersToQueryString(filters)}`,
    watch: ['tasks'],
    // Task changes in this project, plus deletions (which carry no project id).
    match: (signal) => signal.projectId === projectId || signal.op === 'delete',
  })

  return { tasks: data?.tasks ?? null, ...rest }
}
