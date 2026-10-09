import { api, tokenStore } from '@/services/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export interface PresenceEntry {
  _id: string
  online: boolean
  /** UTC ISO time, or null if never seen. */
  lastSeenAt: string | null
}

export interface PresenceReport {
  at: string
  users: PresenceEntry[]
  counts: { online: number; offline: number }
}

export const presenceService = {
  /** "Still here." Goes through the shared client, so an expired token is refreshed like any other request. */
  beat: async (tabId: string) => {
    await api.post('/api/presence', { tabId })
  },

  /**
   * "Goodbye", sent while the page is being closed. A normal request may be cancelled as the page
   * goes away; `keepalive` lets this one finish. (A bearer header cannot be set by `sendBeacon`.)
   * `token` is the one the tab last used: on sign-out the stored token is already gone by the time this runs.
   */
  leave: (tabId: string, token: string | null = tokenStore.access) => {
    if (!token) return
    void fetch(`${API_URL}/api/presence/leave`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ tabId }),
    }).catch(() => {})
  },

  /** Admin only. */
  report: async () => {
    const { data } = await api.get<PresenceReport>('/api/admin/presence')
    return data
  },
}

export interface PeerPresence {
  online: boolean
  lastSeenAt: string | null
  activeSince: string | null
}

/** A teammate's status, for the chat screen. */
export const peerPresenceService = {
  get: async (userId: string) => {
    const { data } = await api.get<PeerPresence>(`/api/presence/user/${userId}`)
    return data
  },
}
