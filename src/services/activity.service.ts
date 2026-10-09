import { api } from '@/services/client'
import type { ActivityPage } from '@/types'

export const activityService = {
  /** One page of a project's feed, newest first. */
  list: async (projectId: string, params: { skip?: number; limit?: number } = {}) => {
    const { data } = await api.get<ActivityPage>(`/api/projects/${projectId}/activity`, { params })
    return data
  },
}
