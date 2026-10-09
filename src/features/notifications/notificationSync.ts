'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { NotificationPage } from '@/types'

/**
 * Keeps every place that shows notifications in step when someone marks them
 * all read. The server stays the source of truth (every surface still loads its
 * own data); this only tells the others "that happened", so they do not have to
 * wait for the push channel:
 *
 *   optimistic : the click was made; show everything they hold as read
 *   confirmed  : the server said yes; reload to match the database exactly
 *   rollback   : the server said no (or failed); put back what was shown before
 */
export type NotificationSyncPhase = 'optimistic' | 'confirmed' | 'rollback'

const EVENT = 'taskflow:notifications-sync'

export function broadcastNotificationSync(phase: NotificationSyncPhase) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent<NotificationSyncPhase>(EVENT, { detail: phase }))
}

/** The same list with everything it holds marked read. Only unread ones change; a notification not in it is not touched. */
export function withAllRead(page: NotificationPage): NotificationPage {
  return {
    ...page,
    notifications: page.notifications.map((n) => (n.read ? n : { ...n, read: true })),
    unreadCount: 0,
  }
}

/**
 * Wire one surface (a hook built on `useRealtimeData`) into the sync. On
 * "optimistic" it shows everything as read and remembers what it showed; on
 * "rollback" it restores exactly that (a plain refetch would not, because the
 * data hook ignores a response equal to the last one it fetched); on
 * "confirmed" it reloads from the server.
 */
export function useNotificationSync(
  mutate: (update: (current: NotificationPage) => NotificationPage) => void,
  refetch: () => Promise<void>
) {
  const snapshot = useRef<NotificationPage | null>(null)
  const latest = useRef({ mutate, refetch })
  latest.current = { mutate, refetch }

  useEffect(() => {
    const onSync = (e: Event) => {
      const phase = (e as CustomEvent<NotificationSyncPhase>).detail
      const { mutate, refetch } = latest.current
      if (phase === 'optimistic') {
        mutate((current) => {
          snapshot.current = current
          return withAllRead(current)
        })
      } else if (phase === 'rollback') {
        const before = snapshot.current
        snapshot.current = null
        if (before) mutate(() => before)
        void refetch()
      } else {
        snapshot.current = null
        void refetch()
      }
    }
    window.addEventListener(EVENT, onSync)
    return () => window.removeEventListener(EVENT, onSync)
  }, [])
}

/**
 * Whether a "mark all as read" request is running. One flag for the whole page,
 * so the button in the header and the one on the page lock together, and a
 * second request cannot start from either while the first is in flight.
 */
let bulkPending = false
const pendingListeners = new Set<() => void>()
export const bulkReadState = {
  get: () => bulkPending,
  set(value: boolean) {
    bulkPending = value
    pendingListeners.forEach((listener) => listener())
  },
}
export function useBulkReadPending(): boolean {
  return useSyncExternalStore(
    (listener) => {
      pendingListeners.add(listener)
      return () => pendingListeners.delete(listener)
    },
    () => bulkPending,
    () => false
  )
}
