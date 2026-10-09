'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { presenceService, type PresenceReport } from '@/services/presence.service'

/** How often the admin's screen asks again. Short enough to feel live, long enough to be cheap. */
const REFRESH_MS = 5_000

/**
 * The admin's view of who is online. Refreshes on its own every few seconds while
 * the page is visible (and at once when it becomes visible again), so people
 * going online and offline show up without reloading. Failures keep the last
 * answer on screen rather than blanking it.
 */
export function usePresence(enabled = true) {
  const [report, setReport] = useState<PresenceReport | null>(null)
  const [error, setError] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const next = await presenceService.report()
      if (mine === seq.current) {
        setReport(next)
        setError(false)
      }
    } catch {
      if (mine === seq.current) setError(true)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    void load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, load])

  const byId = new Map((report?.users ?? []).map((u) => [u._id, u]))
  return { report, byId, counts: report?.counts ?? null, error }
}
