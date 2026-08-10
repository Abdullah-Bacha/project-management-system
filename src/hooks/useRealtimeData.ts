'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '@/lib/api/client'
import {
  subscribeToChanges,
  subscribeToStatus,
} from '@/lib/realtime/events-client'
import { notificationsService } from '@/services/notifications.service'
import { tasksService } from '@/services/tasks.service'
import { useAuthStore } from '@/store/authStore'

interface UseRealtimeDataOptions {
  endpoint: string
  /** Mongo collections whose change signals should trigger a refetch. */
  watch: string[]
  enabled?: boolean
  onUpdate?: (data: any) => void
  /** Poll rate used ONLY while the push channel is down (safety net). */
  fallbackInterval?: number
}

/**
 * Push-driven live data: fetches once on mount, then refetches only when
 * the server signals (over SSE) that a watched collection changed. While
 * the push channel is disconnected it falls back to slow polling so the
 * page still converges, and stops the moment the channel is back.
 */
export function useRealtimeData<T = any>({
  endpoint,
  watch,
  enabled = true,
  onUpdate,
  fallbackInterval = 30000,
}: UseRealtimeDataOptions) {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isLive, setIsLive] = useState(false)
  const isLoggedIn = useAuthStore((state) => Boolean(state.token))

  // Kept in refs so the subscription effect never restarts just because a
  // caller passed a new inline callback or array literal. (A previous
  // version had onUpdate in the effect's dependency chain, which restarted
  // the effect — and fired a fetch — on every render.)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const watchRef = useRef<Set<string>>(new Set(watch))
  watchRef.current = new Set(watch)
  const lastDataRef = useRef<string>('')
  const reqSeqRef = useRef(0)
  const stoppedRef = useRef(false)

  // A new endpoint is a new dataset: drop the old payload and its change
  // fingerprint so it can't display under — or suppress the first update
  // of — the new endpoint.
  useEffect(() => {
    lastDataRef.current = ''
    setData(null)
    setLastUpdated(null)
    setIsLoading(true)
  }, [endpoint])

  const fetchData = useCallback(async (): Promise<boolean> => {
    // Responses may resolve out of order (a slow fetch racing a refetch
    // after a mutation). Only the most recently issued request may write.
    const seq = ++reqSeqRef.current
    try {
      // The shared client attaches the freshest token and transparently
      // refreshes expired ones — raw fetch here would miss rotated tokens.
      const { data: result } = await api.get(endpoint)
      if (seq !== reqSeqRef.current) return true

      const serialized = JSON.stringify(result)
      if (serialized !== lastDataRef.current) {
        lastDataRef.current = serialized
        setData(result)
        setLastUpdated(new Date())
        onUpdateRef.current?.(result)
      }
      setError(null)
      return true
    } catch (err: any) {
      if (seq !== reqSeqRef.current) return true
      // A 401 here means the refresh already failed and the client is
      // redirecting to login — fetching again would just loop on 401s.
      if (err?.response?.status === 401) {
        setError('Session expired — please sign in again')
        return false
      }
      setError(err?.message || 'Failed to fetch')
      return true // transient (network/5xx): stay subscribed
    } finally {
      if (seq === reqSeqRef.current) setIsLoading(false)
    }
  }, [endpoint])

  useEffect(() => {
    if (!enabled || !isLoggedIn) {
      // A hook that will never fetch must not report loading forever.
      setIsLoading(false)
      return
    }

    if (!lastDataRef.current) setIsLoading(true)
    stoppedRef.current = false

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let fallbackTimer: ReturnType<typeof setInterval> | null = null

    const guardedFetch = async () => {
      if (stoppedRef.current) return
      const keepGoing = await fetchData()
      if (!keepGoing) {
        // Session is gone; stop all activity until remount/login.
        stoppedRef.current = true
        if (fallbackTimer) clearInterval(fallbackTimer)
        fallbackTimer = null
      }
    }

    const stopFallback = () => {
      if (fallbackTimer) clearInterval(fallbackTimer)
      fallbackTimer = null
    }

    const startFallback = () => {
      if (fallbackTimer || stoppedRef.current) return
      fallbackTimer = setInterval(guardedFetch, fallbackInterval)
    }

    void guardedFetch()

    // Refetch when the server says a watched collection changed. Bursts
    // (e.g. a multi-document update) coalesce into one request.
    const unsubscribeChanges = subscribeToChanges((signal) => {
      if (!watchRef.current.has(signal.collection)) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => void guardedFetch(), 250)
    })

    // While the push channel is down, poll slowly so the page still
    // converges; on reconnect, refetch once to catch up on missed changes.
    // The first connect is skipped — the mount fetch above already covers it.
    let seenFirstConnect = false
    const unsubscribeStatus = subscribeToStatus((live) => {
      setIsLive(live)
      if (live) {
        stopFallback()
        if (seenFirstConnect) void guardedFetch()
        seenFirstConnect = true
      } else {
        startFallback()
      }
    })

    return () => {
      stoppedRef.current = true
      if (debounceTimer) clearTimeout(debounceTimer)
      stopFallback()
      unsubscribeChanges()
      unsubscribeStatus()
    }
  }, [fetchData, enabled, isLoggedIn, fallbackInterval])

  const refetch = useCallback(async () => {
    // Same gates as the live subscription — a disabled hook (e.g. tasks
    // with no projectId) must not fetch a half-built URL either.
    if (!enabled || !isLoggedIn) return
    await fetchData()
  }, [fetchData, enabled, isLoggedIn])

  return { data, isLoading, error, lastUpdated, isLive, refetch }
}

/**
 * Fire a callback (debounced) when watched collections change, without
 * fetching anything itself — for derived data like dashboard analytics.
 */
export function useRealtimeSignal(
  collections: string[],
  onSignal: () => void,
  debounceMs = 400
) {
  const callbackRef = useRef(onSignal)
  callbackRef.current = onSignal
  const collectionsRef = useRef<Set<string>>(new Set(collections))
  collectionsRef.current = new Set(collections)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = subscribeToChanges((signal) => {
      if (!collectionsRef.current.has(signal.collection)) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => callbackRef.current(), debounceMs)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [debounceMs])
}

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const { isLoading, error, lastUpdated, isLive, refetch } = useRealtimeData({
    endpoint: '/api/notifications',
    watch: ['notifications'],
    onUpdate: (data) => {
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    },
  })

  const markAsRead = useCallback(
    async (notificationId: string) => {
      try {
        await notificationsService.markAsRead(notificationId)
        await refetch()
      } catch (err) {
        console.error('Failed to mark notification as read:', err)
      }
    },
    [refetch]
  )

  return {
    notifications,
    unreadCount,
    isLoading,
    error,
    lastUpdated,
    isLive,
    markAsRead,
    refetch,
  }
}

export function useRealtimeTasks(projectId?: string) {
  const [tasks, setTasks] = useState<any[]>([])

  // Switching projects must not show the previous project's tasks while the
  // new list loads.
  useEffect(() => {
    setTasks([])
  }, [projectId])

  // There is no list-all-tasks endpoint; without a project there is nothing
  // to watch.
  const { isLoading, error, lastUpdated, isLive, refetch } = useRealtimeData({
    endpoint: `/api/projects/${projectId}/tasks`,
    watch: ['tasks', 'comments'],
    enabled: Boolean(projectId),
    onUpdate: (data) => {
      setTasks(data.tasks || [])
    },
  })

  const updateTaskStatus = useCallback(
    async (taskId: string, status: string) => {
      try {
        await tasksService.updateStatus(taskId, status)
        await refetch()
      } catch (err) {
        console.error('Failed to update task:', err)
      }
    },
    [refetch]
  )

  return { tasks, isLoading, error, lastUpdated, isLive, updateTaskStatus, refetch }
}

export function useRealtimeProjects() {
  const [projects, setProjects] = useState<any[]>([])

  // Tasks and team changes feed project progress and membership, so they
  // must trigger a projects refetch too.
  const { isLoading, error, lastUpdated, isLive, refetch } = useRealtimeData({
    endpoint: '/api/projects',
    watch: ['projects', 'tasks', 'teams'],
    onUpdate: (data) => {
      setProjects(data.projects || [])
    },
  })

  return { projects, isLoading, error, lastUpdated, isLive, refetch }
}
