'use client'

import { useRealtimeData } from '@/hooks/useRealtimeData'
import type { Project } from '@/types'

/**
 * The signed-in user's projects, live.
 *
 * Team changes feed project membership and the populated team. Task changes
 * reach a project only through its `progress`, and writing that emits a
 * 'projects' signal of its own — watching 'tasks' here as well would just
 * fire a second, redundant refetch for the same event.
 */
export function useRealtimeProjects() {
  const { data, ...rest } = useRealtimeData<{ projects: Project[]; total: number }>({
    endpoint: '/api/projects',
    watch: ['projects', 'teams'],
  })

  return { projects: data?.projects ?? [], total: data?.total ?? 0, ...rest }
}
