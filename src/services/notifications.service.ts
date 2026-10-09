import { api } from '@/services/client'
import type { Notification, NotificationPage } from '@/types'

export const notificationsService = {
  getAll: async (skip = 0, limit = 10) => {
    const { data } = await api.get<NotificationPage>('/api/notifications', {
      params: { skip, limit },
    })
    return data
  },

  markAsRead: async (id: string) => {
    const { data } = await api.put<{ notification: Notification }>(
      `/api/notifications/${id}/read`,
      {}
    )
    return data.notification
  },

  /** Marks every unread notification of the signed-in user as read. `unreadCount` is what the server still counts as unread. */
  markAllAsRead: async () => {
    const { data } = await api.put<{ updated: number; unreadCount: number }>('/api/notifications', {})
    return data
  },

  delete: async (id: string) => {
    await api.delete(`/api/notifications/${id}`)
  },
}
