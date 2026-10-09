import { api } from '@/services/client'
import { localToday } from '@/lib/due-date'
import type { Project, ProjectAnalytics, ProjectStatus, ReferenceLink } from '@/types'

export interface ProjectInput {
  title: string
  description?: string
  requirements?: string
  startDate?: string
  deadline?: string
  teamId?: string
  referenceLinks?: ReferenceLink[]
}

export type ProjectUpdate = Partial<
  Pick<Project, 'title' | 'description' | 'requirements'> & {
    status: ProjectStatus
    /** YYYY-MM-DD, or null to clear. */
    startDate: string | null
    deadline: string | null
    referenceLinks: ReferenceLink[]
  }
>

export const projectsService = {
  getAll: async (skip = 0, limit = 10) => {
    const { data } = await api.get<{ projects: Project[]; total: number }>('/api/projects', {
      params: { skip, limit },
    })
    return data
  },

  getOne: async (id: string) => {
    const { data } = await api.get<{ project: Project }>(`/api/projects/${id}`)
    return data.project
  },

  create: async (payload: ProjectInput) => {
    const { data } = await api.post<{ project: Project }>('/api/projects', payload)
    return data.project
  },

  update: async (id: string, payload: ProjectUpdate) => {
    const { data } = await api.put<{ project: Project }>(`/api/projects/${id}`, payload)
    return data.project
  },

  delete: async (id: string) => {
    await api.delete(`/api/projects/${id}`)
  },

  getAnalytics: async (id: string) => {
    const { data } = await api.get<ProjectAnalytics>(`/api/projects/${id}/analytics`, { params: { today: localToday() } })
    return data
  },

  addMember: async (projectId: string, userId: string) => {
    const { data } = await api.post<{ project: Project }>(`/api/projects/${projectId}/members`, {
      userId,
    })
    return data.project
  },

  removeMember: async (projectId: string, userId: string) => {
    const { data } = await api.delete<{ project: Project }>(
      `/api/projects/${projectId}/members`,
      { params: { userId } }
    )
    return data.project
  },

  /** Admin-only: (re)assign the staffed team. Pass null to clear it. */
  assign: async (projectId: string, payload: { teamId: string | null }) => {
    const { data } = await api.put<{ project: Project }>(
      `/api/projects/${projectId}/assign`,
      payload
    )
    return data.project
  },
}
