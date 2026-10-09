import { api } from '@/services/client'
import type { Comment, Task, TaskPayload, TaskStatus } from '@/types'

export const tasksService = {
  getByProject: async (projectId: string) => {
    const { data } = await api.get<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`)
    return data.tasks
  },

  /** Tasks of a project matching some text (the same search the Work page uses). */
  searchInProject: async (projectId: string, q: string) => {
    const { data } = await api.get<{ tasks: Task[] }>(`/api/projects/${projectId}/tasks`, { params: { q: q.trim().slice(0, 100) } })
    return data.tasks
  },

  create: async (projectId: string, payload: TaskPayload & { title: string }) => {
    const { data } = await api.post<{ task: Task }>(`/api/projects/${projectId}/tasks`, payload)
    return data.task
  },

  getOne: async (id: string) => {
    const { data } = await api.get<{ task: Task }>(`/api/tasks/${id}`)
    return data.task
  },

  update: async (id: string, payload: TaskPayload) => {
    const { data } = await api.put<{ task: Task }>(`/api/tasks/${id}`, payload)
    return data.task
  },

  updateStatus: async (id: string, status: TaskStatus, order?: number) => {
    const { data } = await api.put<{ task: Task }>(`/api/tasks/${id}/status`, { status, order })
    return data.task
  },

  delete: async (id: string) => {
    await api.delete(`/api/tasks/${id}`)
  },

  getComments: async (taskId: string) => {
    const { data } = await api.get<{ comments: Comment[] }>(`/api/tasks/${taskId}/comments`)
    return data.comments
  },

  addComment: async (taskId: string, text: string) => {
    const { data } = await api.post<{ comment: Comment }>(`/api/tasks/${taskId}/comments`, {
      text,
    })
    return data.comment
  },
}
