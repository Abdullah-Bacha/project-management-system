'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '@/lib/api/client'
import { notificationsService } from '@/services/notifications.service'
import { tasksService } from '@/services/tasks.service'
import { useAuthStore } from '@/store/authStore'

interface UseRealtimeDataOptions {
  endpoint: string
  interval?: number
  enabled?: boolean
  onUpdate?: (data: any) => void
}

export function useRealtimeData<T = any>({
  endpoint,
  interval = 5000,
  enabled = true,
  onUpdate,
}: UseRealtimeDataOptions) {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const isLoggedIn = useAuthStore((state) => Boolean(state.token))

  // Kept in refs so the polling effect never restarts just because a caller
  // passed a new inline callback, and so change detection survives renders.
  // (A previous version had onUpdate in the effect's dependency chain, which
  // restarted the effect — and fired a fetch — on every render.)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const lastDataRef = useRef<string>('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqSeqRef = useRef(0)

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
    // Responses may resolve out of order (a slow poll racing a refetch after
    // a mutation, or an in-flight request surviving an endpoint switch).
    // Only the most recently issued request is allowed to write state.
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
      // redirecting to login — polling again would just loop on 401s.
      if (err?.response?.status === 401) {
        setError('Session expired — please sign in again')
        return false
      }
      setError(err?.message || 'Failed to fetch')
      return true // transient (network/5xx): keep polling
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

    let cancelled = false
    let idleRounds = 0

    const tick = async () => {
      const before = lastDataRef.current
      const keepPolling = await fetchData()
      if (cancelled || !keepPolling) return

      // Back off while nothing changes; snap back to base rate on a change.
      idleRounds = lastDataRef.current === before ? idleRounds + 1 : 0
      const delay = idleRounds >= 3 ? Math.min(interval * 2, 30000) : interval
      timerRef.current = setTimeout(tick, delay)
    }

    tick()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fetchData, enabled, interval, isLoggedIn])

  const refetch = useCallback(async () => {
    // Same gates as the polling loop — a disabled hook (e.g. tasks with no
    // projectId) must not fetch a half-built URL on manual refresh either.
    if (!enabled || !isLoggedIn) return
    await fetchData()
  }, [fetchData, enabled, isLoggedIn])

  return { data, isLoading, error, lastUpdated, refetch }
}

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const { isLoading, error, lastUpdated, refetch } = useRealtimeData({
    endpoint: '/api/notifications',
    interval: 3000,
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

  return { notifications, unreadCount, isLoading, error, lastUpdated, markAsRead, refetch }
}

export function useRealtimeTasks(projectId?: string) {
  const [tasks, setTasks] = useState<any[]>([])

  // Switching projects must not show the previous project's tasks while the
  // new list loads.
  useEffect(() => {
    setTasks([])
  }, [projectId])

  // There is no list-all-tasks endpoint; without a project there is nothing
  // to poll.
  const { isLoading, error, lastUpdated, refetch } = useRealtimeData({
    endpoint: `/api/projects/${projectId}/tasks`,
    interval: 4000,
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

  return { tasks, isLoading, error, lastUpdated, updateTaskStatus, refetch }
}

export function useRealtimeProjects() {
  const [projects, setProjects] = useState<any[]>([])

  const { isLoading, error, lastUpdated, refetch } = useRealtimeData({
    endpoint: '/api/projects',
    interval: 5000,
    onUpdate: (data) => {
      setProjects(data.projects || [])
    },
  })

  return { projects, isLoading, error, lastUpdated, refetch }
}
