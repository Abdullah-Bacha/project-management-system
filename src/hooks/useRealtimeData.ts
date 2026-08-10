'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'

interface UseRealtimeDataOptions {
  endpoint: string
  interval?: number
  enabled?: boolean
  onUpdate?: (data: any) => void
}

export function useRealtimeData<T = any>({
  endpoint,
  interval = 5000, // Default 5 seconds
  enabled = true,
  onUpdate,
}: UseRealtimeDataOptions) {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const token = useAuthStore((state) => state.token)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastDataRef = useRef<string>('')
  const retryCountRef = useRef(0)

  const hasDataChanged = (newData: any): boolean => {
    const newDataStr = JSON.stringify(newData)
    if (newDataStr === lastDataRef.current) {
      return false
    }
    lastDataRef.current = newDataStr
    return true
  }

  const fetchData = useCallback(async () => {
    if (!token) return

    try {
      setIsLoading(true)
      const response = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`)
      }

      const result = await response.json()

      // Only update if data has actually changed
      if (hasDataChanged(result)) {
        setData(result)
        setError(null)
        retryCountRef.current = 0

        if (onUpdate) {
          onUpdate(result)
        }
      }
    } catch (err: any) {
      setError(err.message)
      retryCountRef.current += 1
    } finally {
      setIsLoading(false)
    }
  }, [endpoint, token, onUpdate])

  useEffect(() => {
    if (!enabled) return

    // Fetch immediately on mount
    fetchData()

    // Adaptive polling: if data hasn't changed for 3 consecutive checks,
    // increase interval to reduce server load. Reset when data changes.
    let noChangeCount = 0
    const baseInterval = interval
    let currentInterval = baseInterval

    const poll = async () => {
      const beforeCheck = lastDataRef.current
      await fetchData()
      const afterCheck = lastDataRef.current

      if (beforeCheck === afterCheck) {
        noChangeCount++
        // If data unchanged for 3 polls, increase interval (max 30 seconds)
        if (noChangeCount >= 3) {
          currentInterval = Math.min(baseInterval * 2, 30000)
        }
      } else {
        // Data changed, reset interval
        noChangeCount = 0
        currentInterval = baseInterval
      }

      // Schedule next poll with adaptive interval
      pollIntervalRef.current = setTimeout(poll, currentInterval)
    }

    // Start polling
    pollIntervalRef.current = setTimeout(poll, baseInterval)

    return () => {
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current)
      }
    }
  }, [fetchData, enabled, interval])

  const refetch = useCallback(() => {
    return fetchData()
  }, [fetchData])

  return {
    data,
    isLoading,
    error,
    refetch,
  }
}

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const token = useAuthStore((state) => state.token)

  const { data, isLoading, refetch } = useRealtimeData({
    endpoint: '/api/notifications',
    interval: 3000, // Check notifications every 3 seconds
    onUpdate: (data) => {
      setNotifications(data.notifications || [])
      setUnreadCount(data.unreadCount || 0)
    },
  })

  const markAsRead = useCallback(
    async (notificationId: string) => {
      if (!token) return

      try {
        await fetch(`/api/notifications/${notificationId}/read`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
        await refetch()
      } catch (err) {
        console.error('Failed to mark notification as read:', err)
      }
    },
    [token, refetch]
  )

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    refetch,
  }
}

export function useRealtimeTasks(projectId?: string) {
  const [tasks, setTasks] = useState<any[]>([])
  const token = useAuthStore((state) => state.token)

  const endpoint = projectId ? `/api/projects/${projectId}/tasks` : '/api/tasks'

  const { data, isLoading, refetch } = useRealtimeData({
    endpoint,
    interval: 4000, // Check tasks every 4 seconds
    onUpdate: (data) => {
      setTasks(data.tasks || data || [])
    },
  })

  const updateTaskStatus = useCallback(
    async (taskId: string, status: string) => {
      if (!token) return

      try {
        await fetch(`/api/tasks/${taskId}/status`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        })
        await refetch()
      } catch (err) {
        console.error('Failed to update task:', err)
      }
    },
    [token, refetch]
  )

  return {
    tasks,
    isLoading,
    updateTaskStatus,
    refetch,
  }
}

export function useRealtimeProjects() {
  const [projects, setProjects] = useState<any[]>([])
  const token = useAuthStore((state) => state.token)

  const { data, isLoading, refetch } = useRealtimeData({
    endpoint: '/api/projects',
    interval: 5000, // Check projects every 5 seconds
    onUpdate: (data) => {
      setProjects(data.projects || data || [])
    },
  })

  return {
    projects,
    isLoading,
    refetch,
  }
}
