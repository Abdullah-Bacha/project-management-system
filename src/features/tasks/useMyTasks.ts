'use client'

import { useRealtimeData } from '@/hooks/useRealtimeData'
import { filtersToQueryString, type TaskFilters } from '@/lib/task-filters'
import { localToday } from '@/lib/due-date'
import type { MyTasksPage } from '@/types'

/** Open tasks assigned to the signed-in user, across their projects, live. */
export function useMyTasks(limit: number, includeCompleted = false, filters: TaskFilters = {}) {
  const { data, ...rest } = useRealtimeData<MyTasksPage>({
    // `today` is the viewer's own date, so overdue counts match what they see on their calendar.
    endpoint: `/api/tasks/mine?limit=${limit}${includeCompleted ? '&include=all' : ''}${filtersToQueryString(filters) ? `&${filtersToQueryString(filters)}` : ''}${filters.due ? '' : `&today=${localToday()}`}`,
    watch: ['tasks', 'projects'],
  })

  return {
    tasks: data?.tasks ?? [],
    total: data?.total ?? 0,
    overdue: data?.overdue ?? 0,
    counts: data?.counts ?? { todo: 0, 'in-progress': 0, review: 0, complete: 0 },
    ...rest,
  }
}
