import { api } from '@/lib/api/client'

export const tasksService = {
  getByProject: async (projectId: string, filters?: any) => {
    const { data } = await api.get(`/api/projects/${projectId}/tasks`, {
      params: {
        ...(filters?.status && { status: filters.status }),
        ...(filters?.priority && { priority: filters.priority }),
      },
    })
    return data.tasks
  },

  create: async (projectId: string, payload: any) => {
    const { data } = await api.post(`/api/projects/${projectId}/tasks`, payload)
    return data.task
  },

  getOne: async (id: string) => {
    const { data } = await api.get(`/api/tasks/${id}`)
    return data.task
  },

  update: async (id: string, payload: any) => {
    const { data } = await api.put(`/api/tasks/${id}`, payload)
    return data.task
  },

  updateStatus: async (id: string, status: string, order?: number) => {
    const { data } = await api.put(`/api/tasks/${id}/status`, { status, order })
    return data.task
  },

  delete: async (id: string) => {
    const { data } = await api.delete(`/api/tasks/${id}`)
    return data
  },

  getComments: async (taskId: string) => {
    const { data } = await api.get(`/api/tasks/${taskId}/comments`)
    return data.comments
  },

  addComment: async (taskId: string, text: string) => {
    const { data } = await api.post(`/api/tasks/${taskId}/comments`, { text })
    return data.comment
  },
}
