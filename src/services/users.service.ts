import { api } from '@/services/client'
import type { UserSummary } from '@/types'

export const usersService = {
  /** Admin-only: search people to add to a project. Returns [] for terms under 2 characters. */
  search: async (q: string) => {
    const { data } = await api.get<{ users: UserSummary[] }>('/api/users/search', { params: { q } })
    return data.users
  },
}
