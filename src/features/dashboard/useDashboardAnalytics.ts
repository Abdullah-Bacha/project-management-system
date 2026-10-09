'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { projectsService } from '@/services/projects.service'
import { useRealtimeSignal } from '@/hooks/useRealtimeData'
import type { Project, ProjectAnalytics } from '@/types'

export interface DashboardTotals {
  tasks: number
  completed: number
  overdue: number
}

/**
 * Task metrics for the projects shown on the dashboard: one analytics request
 * per project (all at once), kept live.
 *
 * One task edit reaches the dashboard twice — as a 'tasks' signal and again as
 * a changed project (its progress is rewritten) — and used to start a full
 * fan-out each time. The analytics are only re-fetched for:
 *   - a different set of projects (first load, created/removed/reassigned),
 *   - a 'tasks' signal (the live path), or
 *   - any project change while the push channel is down — then no 'tasks'
 *     signal can arrive, so the polled progress change is the only cue.
 * Triggers that land close together are coalesced into a single batch.
 */
export function useDashboardAnalytics(projects: Project[], isLive: boolean) {
  const [byProject, setByProject] = useState<Record<string, ProjectAnalytics>>({})
  const [ready, setReady] = useState(false)
  const [version, setVersion] = useState(0)
  useRealtimeSignal(['tasks'], () => setVersion((v) => v + 1))

  const idsKey = projects.map((p) => p._id).join(',')
  const projectsKey = projects.map((p) => `${p._id}:${p.progress}:${p.status}`).join(',')
  const isLiveRef = useRef(isLive)
  isLiveRef.current = isLive
  const lastRun = useRef<{ ids: string; version: number } | null>(null)

  useEffect(() => {
    if (projects.length === 0) {
      lastRun.current = null
      setByProject({})
      setReady(true) // nothing to measure is a complete answer
      return
    }

    const previous = lastRun.current
    const needsAnalytics =
      !previous ||
      previous.ids !== idsKey ||
      previous.version !== version ||
      !isLiveRef.current
    if (!needsAnalytics) return

    // Guards against overlapping runs resolving out of order when something
    // changes again while an earlier batch is still in flight.
    let stale = false

    const load = async () => {
      lastRun.current = { ids: idsKey, version }
      const results = await Promise.all(
        projects.map((p) => projectsService.getAnalytics(p._id).catch(() => null))
      )
      if (stale) return
      const next: Record<string, ProjectAnalytics> = {}
      results.forEach((analytics, i) => {
        if (analytics) next[projects[i]._id] = analytics
      })
      setByProject(next)
      setReady(true)
    }

    // First load goes out immediately; later triggers wait briefly so
    // near-simultaneous ones collapse into one batch.
    const timer = setTimeout(load, previous ? 300 : 0)

    return () => {
      stale = true
      clearTimeout(timer)
    }
    // `projects` is read inside, but projectsKey covers every field the effect
    // depends on — a new array identity alone must not re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, projectsKey, version])

  const totals = useMemo<DashboardTotals>(() => {
    const all = Object.values(byProject)
    return {
      tasks: all.reduce((sum, a) => sum + a.totalTasks, 0),
      completed: all.reduce((sum, a) => sum + a.completedTasks, 0),
      overdue: all.reduce((sum, a) => sum + a.overdueTasks, 0),
    }
  }, [byProject])

  return { byProject, totals, ready }
}
