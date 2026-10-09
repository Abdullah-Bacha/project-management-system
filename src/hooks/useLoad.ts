'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface LoadState<T> {
  data: T | null
  loading: boolean
  /** A user-presentable message, or null. */
  error: string | null
  /** HTTP status of the failure, when the server answered (404, 403, …). */
  errorStatus: number | null
  reload: () => Promise<void>
  setData: React.Dispatch<React.SetStateAction<T | null>>
}

/**
 * Load something once (and again when `deps` change or `reload()` is called),
 * and report it as exactly one of: loading, error, or data. Pages render
 * those three states instead of juggling their own booleans — so a failed
 * request can never be mistaken for "still loading".
 */
export function useLoad<T>(fetcher: () => Promise<T>, deps: unknown[] = []): LoadState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorStatus, setErrorStatus] = useState<number | null>(null)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const seqRef = useRef(0)

  const reload = useCallback(async () => {
    const seq = ++seqRef.current // only the latest request may write
    try {
      const result = await fetcherRef.current()
      if (seq !== seqRef.current) return
      setData(result)
      setError(null)
      setErrorStatus(null)
    } catch (err: any) {
      if (seq !== seqRef.current) return
      setErrorStatus(err?.response?.status ?? null)
      setError(err?.response?.data?.error || err?.message || 'Something went wrong')
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, ...deps])

  return { data, loading, error, errorStatus, reload, setData }
}
