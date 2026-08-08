import { api } from '@/lib/api/client'

export const projectsService = {
  getAll: async (skip = 0, limit = 10) => {
    const { data } = await api.get('/api/projects', { params: { skip, limit } })
    return data
  },

  getOne: async (id: string) => {
    const { data } = await api.get(`/api/projects/${id}`)
    return data.project
  },

  create: async (payload: any) => {
    const { data } = await api.post('/api/projects', payload)
    return data.project
  },

  update: async (id: string, payload: any) => {
    const { data } = await api.put(`/api/projects/${id}`, payload)
    return data.project
  },

  delete: async (id: string) => {
    const { data } = await api.delete(`/api/projects/${id}`)
    return data
  },

  getAnalytics: async (id: string) => {
    const { data } = await api.get(`/api/projects/${id}/analytics`)
    return data
  },

  getMembers: async (projectId: string) => {
    const { data } = await api.get(`/api/projects/${projectId}/members`)
    return data.members
  },

  addMember: async (projectId: string, userId: string) => {
    const { data } = await api.post(`/api/projects/${projectId}/members`, { userId })
    return data.project
  },

  removeMember: async (projectId: string, userId: string) => {
    const { data } = await api.delete(`/api/projects/${projectId}/members`, {
      params: { userId },
    })
    return data.project
  },

  /** Admin-only: (re)assign the staffed team. Pass null to clear it. */
  assign: async (projectId: string, payload: { teamId: string | null }) => {
    const { data } = await api.put(`/api/projects/${projectId}/assign`, payload)
    return data.project
  },
}
