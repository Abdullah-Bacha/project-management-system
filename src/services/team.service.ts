import { api } from '@/services/client'
import type { Team, DirectMessage } from '@/types'

/** 1:1 chat with a teammate (server enforces that you share a team). */
export const messageService = {
  list: async (userId: string) => {
    const { data } = await api.get<{ messages: DirectMessage[] }>(`/api/messages/${userId}`)
    return data.messages
  },
  unread: async () => {
    const { data } = await api.get<{ counts: Record<string, number> }>('/api/messages/unread')
    return data.counts
  },
  send: async (userId: string, text: string) => {
    const { data } = await api.post<{ message: DirectMessage }>(`/api/messages/${userId}`, { text })
    return data.message
  },
}

/** Open to any authenticated user: returns only the caller's own team(s). */
export const myTeamService = {
  get: async () => {
    const { data } = await api.get<{ teams: Team[] }>('/api/teams/mine')
    return data.teams
  },
}
