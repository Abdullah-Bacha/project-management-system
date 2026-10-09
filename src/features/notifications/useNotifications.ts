'use client'

import { useCallback } from 'react'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { notificationsService } from '@/services/notifications.service'
import { useNotificationSync } from './notificationSync'
import type { NotificationPage } from '@/types'

/**
 * The unread badge. One tiny request (a single row; the count comes with it),
 * refreshed whenever the server says one of THIS user's notifications changed,
 * and in step with "mark all as read" wherever it is clicked.
 */
export function useUnreadCount() {
  const { data, mutate, refetch } = useRealtimeData<NotificationPage>({
    endpoint: '/api/notifications?skip=0&limit=1',
    watch: ['notifications'],
  })
  useNotificationSync(mutate, refetch)
  return data?.unreadCount ?? 0
}

/**
 * The notification list, live. New notifications arrive over SSE; marking one
 * read is applied locally right away (the server only sets the same flag, so
 * no reload is needed) and put back exactly as it was if the call fails.
 * Server-side "update" signals are our own mark-read echoes and are skipped;
 * "mark all as read" reaches this list through notificationSync instead.
 */
export function useNotifications() {
  const { data, isLoading, error, errorStatus, refetch, mutate } = useRealtimeData<NotificationPage>({
    endpoint: '/api/notifications?skip=0&limit=50',
    watch: ['notifications'],
    match: (signal) => signal.op !== 'update',
  })
  useNotificationSync(mutate, refetch)

  const markAsRead = useCallback(
    async (id: string) => {
      let before: NotificationPage | null = null
      mutate((page) => {
        before = page
        return {
          ...page,
          notifications: page.notifications.map((n) => (n._id === id ? { ...n, read: true } : n)),
          unreadCount: Math.max(0, page.unreadCount - (page.notifications.find((n) => n._id === id && !n.read) ? 1 : 0)),
        }
      })
      try {
        await notificationsService.markAsRead(id)
      } catch {
        // Put back what was shown (a plain refetch would not: the data hook ignores a response equal to its last one).
        const restore = before
        if (restore) mutate(() => restore)
        await refetch()
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
