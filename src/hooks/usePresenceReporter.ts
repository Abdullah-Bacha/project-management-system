'use client'

import { useEffect } from 'react'
import { HEARTBEAT_MS } from '@/lib/presence'
import { tokenStore } from '@/services/client'
import { presenceService } from '@/services/presence.service'

const TAB_KEY = 'taskflow-tab-id'

/** A goodbye waiting to be sent after the dashboard unmounted; a quick remount (React's dev double-mount) cancels it. */
let pendingLeave: ReturnType<typeof setTimeout> | null = null

/**
 * This tab's id. It lives in sessionStorage, which belongs to ONE tab: a refresh
 * or moving between pages keeps the same id (so it is the same tab, not a new
 * one), while a second tab gets its own.
 */
function tabId(): string {
  try {
    const existing = sessionStorage.getItem(TAB_KEY)
    if (existing) return existing
    const fresh = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
    sessionStorage.setItem(TAB_KEY, fresh)
    return fresh
  } catch {
    // Storage blocked: an id for this page load only (a refresh then counts as a new tab, which still works).
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
}

/**
 * Tells the server that this signed-in TaskFlow tab is open: once at start, then
 * every few seconds, and again whenever the tab comes back to the foreground or
 * the network returns. When the tab is closed (or the person signs out and the
 * dashboard goes away) it says goodbye. Mounted once in the dashboard layout, so
 * moving between pages never counts as leaving.
 *
 * It does not look at mouse or keyboard activity: an open, idle tab is online.
 */
export function usePresenceReporter(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn) return
    const id = tabId()
    let stopped = false
    // The token this tab last used, kept for the goodbye (it is cleared from storage when signing out).
    let lastToken = tokenStore.access
    if (pendingLeave) {
      clearTimeout(pendingLeave)
      pendingLeave = null
    }

    const beat = () => {
      if (stopped) return
      lastToken = tokenStore.access ?? lastToken
      presenceService.beat(id).catch(() => {
        // A missed beat is fine: the next one (or the "back online" event) catches up.
      })
    }

    beat()
    const timer = setInterval(beat, HEARTBEAT_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') beat()
    }
    // A page restored from the browser's back/forward cache was told goodbye; it is here again.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) beat()
    }
    const onPageHide = () => presenceService.leave(id, tokenStore.access ?? lastToken)

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', beat)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', beat)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('pagehide', onPageHide)
      // The dashboard is going away inside this tab (signing out): say goodbye, unless it comes straight back.
      pendingLeave = setTimeout(() => {
        pendingLeave = null
        presenceService.leave(id, lastToken)
      }, 400)
    }
  }, [signedIn])
}
