import { api } from '@/lib/api/client'

/** Open to any authenticated user — returns only the caller's own team(s). */
export const myTeamService = {
  get: async () => {
    const { data } = await api.get('/api/teams/mine')
    return data.teams as any[]
  },
}
