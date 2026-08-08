import { api } from '@/lib/api/client'
import { UserRole } from '@/types'

export const adminUsersService = {
  list: async (role?: UserRole) => {
    const { data } = await api.get('/api/admin/users', {
      params: role ? { role } : {},
    })
    return data as { users: any[]; total: number }
  },

  create: async (payload: {
    name: string
    email: string
    password: string
    role: UserRole
  }) => {
    const { data } = await api.post('/api/admin/users', payload)
    return data.user
  },

  update: async (
    id: string,
    payload: { name?: string; role?: UserRole; status?: string }
  ) => {
    const { data } = await api.put(`/api/admin/users/${id}`, payload)
    return data.user
  },
}

export const teamsService = {
  list: async () => {
    const { data } = await api.get('/api/admin/teams')
    return data.teams as any[]
  },

  getOne: async (id: string) => {
    const { data } = await api.get(`/api/admin/teams/${id}`)
    return data.team
  },

  create: async (payload: {
    name: string
    description?: string
    teamLeaderId: string
    memberIds: string[]
  }) => {
    const { data } = await api.post('/api/admin/teams', payload)
    return data.team
  },

  update: async (
    id: string,
    payload: Partial<{
      name: string
      description: string
      teamLeaderId: string
      memberIds: string[]
    }>
  ) => {
    const { data } = await api.put(`/api/admin/teams/${id}`, payload)
    return data.team
  },

  delete: async (id: string) => {
    const { data } = await api.delete(`/api/admin/teams/${id}`)
    return data
  },
}
