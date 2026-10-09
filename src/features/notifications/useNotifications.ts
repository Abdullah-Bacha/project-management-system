'use client'

import { useCallback } from 'react'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { notificationsService } from '@/services/notifications.service'
import type { NotificationPage } from '@/types'

/**
 * The unread badge. One tiny request (a single row; the count comes with it),
 * refreshed whenever the server says one of THIS user's notifications changed.
 */
export function useUnreadCount() {
  const { data } = useRealtimeData<NotificationPage>({
    endpoint: '/api/notifications?skip=0&limit=1',
    watch: ['notifications'],
  })
  return data?.unreadCount ?? 0
}

/**
 * The notification list, live. New notifications arrive over SSE; marking one
 * read is applied locally right away (the server only sets the same flag, so
 * no reload is needed) and rolled back by a refetch if the call fails.
 * Server-side "update" signals are our own mark-read echoes and are skipped.
 */
export function useNotifications() {
  const { data, isLoading, error, errorStatus, refetch, mutate } = useRealtimeData<NotificationPage>({
    endpoint: '/api/notifications?skip=0&limit=50',
    watch: ['notifications'],
    match: (signal) => signal.op !== 'update',
  })

  const markAsRead = useCallback(
    async (id: string) => {
      mutate((page) => ({
        ...page,
        notifications: page.notifications.map((n) => (n._id === id ? { ...n, read: true } : n)),
        unreadCount: Math.max(
          0,
          page.unreadCount - (page.notifications.find((n) => n._id === id && !n.read) ? 1 : 0)
        ),
      }))
      try {
        await notificationsService.markAsRead(id)
      } catch {
        await refetch() // roll back to what the server says
      }
    },
    [mutate, refetch]
  )

  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    isLoading,
    error,
    errorStatus,
    refetch,
    markAsRead,
  }
}
