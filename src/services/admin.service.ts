import { api } from '@/services/client'
import type { Team, User, UserRole, UserStatus } from '@/types'

/** A user row in the admin table. */
export type AdminUser = Pick<User, '_id' | 'name' | 'email' | 'role' | 'status' | 'phone' | 'profilePicture' | 'createdAt'>

export const adminUsersService = {
  list: async (role?: UserRole, limit?: number) => {
    const { data } = await api.get<{ users: AdminUser[]; total: number }>('/api/admin/users', {
      params: { ...(role && { role }), ...(limit && { limit }) },
    })
    return data
  },

  create: async (payload: { name: string; email: string; password: string; role: UserRole; phone?: string; profilePicture?: string }) => {
    const { data } = await api.post<{ user: AdminUser }>('/api/admin/users', payload)
    return data.user
  },

  update: async (
    id: string,
    payload: { name?: string; role?: UserRole; status?: UserStatus; phone?: string; profilePicture?: string }
  ) => {
    const { data } = await api.put<{ user: AdminUser }>(`/api/admin/users/${id}`, payload)
    return data.user
  },
}

export interface TeamPayload {
  name: string
  description?: string
  teamLeaderId: string
  memberIds: string[]
}

export const teamsService = {
  list: async () => {
    const { data } = await api.get<{ teams: Team[] }>('/api/admin/teams')
    return data.teams
  },

  create: async (payload: TeamPayload) => {
    const { data } = await api.post<{ team: Team }>('/api/admin/teams', payload)
    return data.team
  },

  update: async (id: string, payload: Partial<TeamPayload>) => {
    const { data } = await api.put<{ team: Team }>(`/api/admin/teams/${id}`, payload)
    return data.team
  },

  delete: async (id: string) => {
    await api.delete(`/api/admin/teams/${id}`)
  },
}
