'use client'

import { useCallback, useEffect, useRef } from 'react'
import { tasksService } from '@/services/tasks.service'
import { subscribeToStatus } from '@/services/events'
import { useLoad } from '@/hooks/useLoad'
import { useRealtimeEvent } from '@/hooks/useRealtimeData'
import type { ChangeSignal, Task } from '@/types'

const POLL_WHILE_OFFLINE_MS = 30_000

const byOrder = (a: Task, b: Task) => a.order - b.order

/**
 * A project's tasks, kept live.
 *
 * Loaded once. After that the server only tells us WHICH task changed (and
 * only for projects we belong to), so a change costs one request for that
 * one task — never a reload of the whole board — and a change we made
 * ourselves (already merged from the API response) costs none. Deletions are
 * applied locally. If the push channel drops, the list is re-read on a slow
 * timer and once more when it comes back.
 */
export function useProjectTasks(projectId: string) {
  const { data, loading, error, errorStatus, reload, setData } = useLoad(
    () => tasksService.getByProject(projectId),
    [projectId]
  )

  const tasksRef = useRef(data)
  tasksRef.current = data

  const upsertTask = useCallback(
    (task: Task) =>
      setData((current) => {
        if (!current) return current
        const old = current.find((t) => t._id === task._id)
        // Write responses carry no blocker counts; keep the ones we already know.
        const merged: Task =
          old && task.openBlockers === undefined ? { ...task, blockedByCount: old.blockedByCount, openBlockers: old.openBlockers } : task
        const next = old ? current.map((t) => (t._id === task._id ? merged : t)) : [...current, merged]
        return next.sort(byOrder)
      }),
    [setData]
  )

  const removeTask = useCallback(
    (id: string) => setData((current) => current && current.filter((t) => t._id !== id)),
    [setData]
  )

  // One re-read however many signals arrive close together.
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) return
    reloadTimer.current = setTimeout(() => {
      reloadTimer.current = null
      void reload()
    }, 600)
  }, [reload])
  useEffect(
    () => () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
    },
    []
  )

  const onSignal = useCallback(
    async (signal: ChangeSignal) => {
      if (signal.op === 'delete') {
        removeTask(signal.id)
        return
      }

      const known = tasksRef.current?.find((t) => t._id === signal.id)
      // A task whose blockers' state may have changed is shown with a blocker count, which lives on
      // the BLOCKED task, not on the one that just changed. Re-read the list when a task crosses the
      // Complete line, or when someone else's task (a possible blocker) changes.
      const anyBlocked = tasksRef.current?.some((t) => (t.blockedByCount ?? 0) > 0)
      const refreshIfBlockersAffected = (task?: Task) => {
        if (!anyBlocked) return
        if (!task || !known || (task.status === 'complete') !== (known.status === 'complete')) scheduleReload()
      }

      // Already have this version (typically: our own write) — nothing to do.
      if (known && signal.updatedAt && new Date(known.updatedAt).getTime() >= signal.updatedAt) return

      try {
        const task = await tasksService.getOne(signal.id)
        if (task.projectId === projectId) upsertTask(task)
        refreshIfBlockersAffected(task)
      } catch {
        // Not ours to see, or gone already — the next signal will sort it out.
        refreshIfBlockersAffected()
      }
    },
    [projectId, removeTask, upsertTask, scheduleReload]
  )

  // This project's task signals, plus deletions (which carry no project id;
  // removing an id we do not hold is a no-op).
  useRealtimeEvent(
    ['tasks'],
    onSignal,
    (signal) => signal.projectId === projectId || signal.op === 'delete'
  )

  // Push channel down → poll slowly; back up → catch up once.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null
    let seenFirstConnect = false

    const unsubscribe = subscribeToStatus((live) => {
      if (live) {
        if (timer) clearInterval(timer)
        timer = null
        if (seenFirstConnect) void reload()
        seenFirstConnect = true
      } else if (!timer) {
        timer = setInterval(() => void reload(), POLL_WHILE_OFFLINE_MS)
      }
    })

    return () => {
      unsubscribe()
      if (timer) clearInterval(timer)
    }
  }, [reload])

  return { tasks: data, loading, error, errorStatus, reload, upsertTask, removeTask }
}
