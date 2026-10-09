import { api } from '@/services/client'

export const dependenciesService = {
  /** Make `blockingTaskId` a blocker of `taskId`. */
  add: async (taskId: string, blockingTaskId: string) => {
    await api.post(`/api/tasks/${taskId}/dependencies`, { blockingTaskId })
  },

  remove: async (taskId: string, dependencyId: string) => {
    await api.delete(`/api/tasks/${taskId}/dependencies/${dependencyId}`)
  },
}
