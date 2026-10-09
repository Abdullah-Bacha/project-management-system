'use client'

import { useEffect, useState } from 'react'
import { peerPresenceService, type PeerPresence } from '@/services/presence.service'

const REFRESH_MS = 15_000

/**
 * A teammate's online status, asked for when the chat opens and again every few
 * seconds while it stays open and visible. `null` until the first answer (or if
 * it cannot be loaded), so the screen shows nothing rather than guess.
 */
export function usePeerPresence(userId: string) {
  const [presence, setPresence] = useState<PeerPresence | null>(null)

  useEffect(() => {
    let cancelled = false
    setPresence(null)
    const load = () => {
      peerPresenceService
        .get(userId)
        .then((p) => !cancelled && setPresence(p))
        .catch(() => {})
    }
    load()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, REFRESH_MS)
    const onVisible = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [userId])

  return presence
}
