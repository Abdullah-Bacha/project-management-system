import { api } from '@/lib/api/client'

export const notificationsService = {
  getAll: async (skip = 0, limit = 10) => {
    const { data } = await api.get('/api/notifications', {
      params: { skip, limit },
    })
    return data
  },

  getUnread: async () => {
    const { data } = await api.get('/api/notifications', {
      params: { read: false },
    })
    return data
  },

  markAsRead: async (id: string) => {
    const { data } = await api.put(`/api/notifications/${id}/read`, {})
    return data.notification
  },

  markAllAsRead: async () => {
    const { data } = await api.put('/api/notifications', {})
    return data
  },

  delete: async (id: string) => {
    const { data } = await api.delete(`/api/notifications/${id}`)
    return data
  },
}
