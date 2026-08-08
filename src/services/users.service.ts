import { api } from '@/lib/api/client'

export const usersService = {
  /** Search people to invite. Returns [] for terms shorter than 2 characters. */
  search: async (q: string) => {
    const { data } = await api.get('/api/users/search', { params: { q } })
    return data.users
  },
}
