'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '@/services/client'
import { subscribeToChanges, subscribeToStatus } from '@/services/events'
import { useAuthStore } from '@/store/authStore'
import type { ChangeSignal } from '@/types'

type Match = (signal: ChangeSignal) => boolean

interface UseRealtimeDataOptions<T> {
  endpoint: string
  /** Mongo collections whose change signals should trigger a refetch. */
  watch: string[]
  /** Narrow the watched signals further (e.g. only this project). */
  match?: Match
  enabled?: boolean
  onUpdate?: (data: T) => void
  /** Poll rate used ONLY while the push channel is down (safety net). */
  fallbackInterval?: number
}

/**
 * Push-driven live data: fetches once on mount, then refetches only when
 * the server signals (over SSE) that something this client cares about
 * changed. While the push channel is disconnected it falls back to slow
 * polling so the page still converges, and stops the moment the channel is
 * back.
 */
export function useRealtimeData<T = unknown>({
  endpoint,
  watch,
  match,
  enabled = true,
  onUpdate,
  fallbackInterval = 30000,
}: UseRealtimeDataOptions<T>) {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isLive, setIsLive] = useState(false)
  const isLoggedIn = useAuthStore((state) => Boolean(state.token))

  // Kept in refs so the subscription effect never restarts just because a
  // caller passed a new inline callback or array literal.
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate
  const watchRef = useRef<Set<string>>(new Set(watch))
  watchRef.current = new Set(watch)
  const matchRef = useRef(match)
  matchRef.current = match
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
    setError(null)
    setErrorStatus(null)
    setIsLoading(true)
  }, [endpoint])

  const fetchData = useCallback(async (): Promise<boolean> => {
    // Responses may resolve out of order (a slow fetch racing a refetch
    // after a mutation). Only the most recently issued request may write.
    const seq = ++reqSeqRef.current
    try {
      // The shared client attaches the freshest token and transparently
      // refreshes expired ones.
      const { data: result } = await api.get<T>(endpoint)
      if (seq !== reqSeqRef.current) return true

      const serialized = JSON.stringify(result)
      if (serialized !== lastDataRef.current) {
        lastDataRef.current = serialized
        setData(result)
        setLastUpdated(new Date())
        onUpdateRef.current?.(result)
      }
      setError(null)
      setErrorStatus(null)
      return true
    } catch (err: any) {
      if (seq !== reqSeqRef.current) return true
      const status: number | undefined = err?.response?.status
      setErrorStatus(status ?? null)
      // A 401 here means the refresh already failed and the client is
      // redirecting to login — fetching again would just loop on 401s.
      if (status === 401) {
        setError('Session expired — please sign in again')
        return false
      }
      setError(err?.response?.data?.error || err?.message || 'Failed to fetch')
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
      if (matchRef.current && !matchRef.current(signal)) return
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
    // Same gates as the live subscription — a disabled hook must not fetch
    // a half-built URL either.
    if (!enabled || !isLoggedIn) return
    await fetchData()
  }, [fetchData, enabled, isLoggedIn])

  /** Apply an optimistic local change (the next server answer replaces it). */
  const mutate = useCallback((update: (current: T) => T) => {
    setData((current) => (current === null ? current : update(current)))
  }, [])

  return { data, isLoading, error, errorStatus, lastUpdated, isLive, refetch, mutate }
}

/**
 * Call `handler` for every signal on the watched collections, as it arrives
 * (optionally narrowed by `match`). For reactions that need the signal itself,
 * such as patching one task instead of reloading a list.
 */
export function useRealtimeEvent(
  collections: string[],
  handler: (signal: ChangeSignal) => void,
  match?: Match
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const matchRef = useRef(match)
  matchRef.current = match
  const collectionsRef = useRef<Set<string>>(new Set(collections))
  collectionsRef.current = new Set(collections)

  useEffect(() => {
    return subscribeToChanges((signal) => {
      if (!collectionsRef.current.has(signal.collection)) return
      if (matchRef.current && !matchRef.current(signal)) return
      handlerRef.current(signal)
    })
  }, [])
}

/**
 * Fire a callback (debounced) when watched collections change, without
 * fetching anything itself — for derived data like dashboard analytics.
 */
export function useRealtimeSignal(
  collections: string[],
  onSignal: () => void,
  debounceMs = 400,
  match?: Match
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onSignalRef = useRef(onSignal)
  onSignalRef.current = onSignal

  useRealtimeEvent(
    collections,
    () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => onSignalRef.current(), debounceMs)
    },
    match
  )

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])
}
