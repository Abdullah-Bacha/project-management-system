'use client'

import { useRealtimeData } from '@/hooks/useRealtimeData'
import { localToday } from '@/lib/due-date'
import type { ProjectAnalytics } from '@/types'

/** A project's task metrics, refreshed when tasks in THIS project change. */
export function useProjectAnalytics(projectId: string) {
  return useRealtimeData<ProjectAnalytics>({
    endpoint: `/api/projects/${projectId}/analytics?today=${localToday()}`,
    watch: ['tasks'],
    match: (signal) => signal.projectId === projectId,
  })
}
