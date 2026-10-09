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

  markAllAsRead: async () => {
    await api.put('/api/notifications', {})
  },

  delete: async (id: string) => {
    await api.delete(`/api/notifications/${id}`)
  },
}
