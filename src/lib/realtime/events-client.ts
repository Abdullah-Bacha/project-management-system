'use client'

import { api, tokenStore } from '@/lib/api/client'

/**
 * One shared SSE connection per browser tab, fanned out to every hook that
 * subscribes. Uses fetch streaming instead of EventSource so the Bearer
 * token can travel in a header rather than a query string.
 */
export interface ChangeSignal {
  collection: string
  op: string
}

type SignalListener = (signal: ChangeSignal) => void
type StatusListener = (connected: boolean) => void

const signalListeners = new Set<SignalListener>()
const statusListeners = new Set<StatusListener>()

let abortController: AbortController | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let backoff = 1000
let connected = false
let running = false

function setConnected(value: boolean) {
  if (connected === value) return
  connected = value
  statusListeners.forEach((fn) => {
    try {
      fn(value)
    } catch {
      // Listener errors must not break the connection loop.
    }
  })
}

function dispatch(signal: ChangeSignal) {
  signalListeners.forEach((fn) => {
    try {
      fn(signal)
    } catch {
      // Ditto.
    }
  })
}

function scheduleReconnect() {
  if (!running || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    backoff = Math.min(backoff * 2, 30000)
    void connect()
  }, backoff)
}

async function connect(): Promise<void> {
  if (!running || abortController) return

  const token = tokenStore.access
  if (!token) {
    scheduleReconnect()
    return
  }

  // Held locally so this attempt's teardown can only clear the module-level
  // ref while it is still the current one. Without this, an aborted
  // attempt's `finally` nulls out a newer connection's controller and the
  // newer socket is orphaned — it stays open with nothing able to close it.
  const controller = new AbortController()
  abortController = controller
  const isCurrent = () => abortController === controller

  try {
    const response = await fetch('/api/events', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      cache: 'no-store',
    })

    if (response.status === 401) {
      // Nudge the axios interceptor into refreshing the token, then retry.
      if (isCurrent()) abortController = null
      try {
        await api.get('/api/auth/me')
        if (running) void connect()
      } catch {
        // Refresh failed — the interceptor is redirecting to login.
        setConnected(false)
      }
      return
    }

    if (!response.ok || !response.body) {
      throw new Error(`SSE connect failed: ${response.status}`)
    }

    setConnected(true)
    backoff = 1000

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    for (;;) {
      const { done, value } = await reader.read()
      if (done || !isCurrent()) break

      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line.
      let sep: number
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)

        for (const line of frame.split('\n')) {
          if (!line.startsWith('data: ')) continue
          try {
            dispatch(JSON.parse(line.slice(6)))
          } catch {
            // Ignore malformed frames.
          }
        }
      }
    }
  } catch {
    // Aborted locally or dropped remotely — the finally block handles both.
  } finally {
    // A superseded attempt must not touch shared state: the connection that
    // replaced it owns the status and the reconnect schedule now.
    if (isCurrent()) {
      abortController = null
      setConnected(false)
      scheduleReconnect()
    }
  }
}

function stop() {
  running = false
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  abortController?.abort()
  abortController = null
  setConnected(false)
}

function ensureRunning() {
  if (running) return
  running = true
  backoff = 1000
  void connect()
}

/** Listen for change signals. The connection opens with the first listener
 *  and closes when the last one unsubscribes. */
export function subscribeToChanges(fn: SignalListener): () => void {
  signalListeners.add(fn)
  ensureRunning()
  return () => {
    signalListeners.delete(fn)
    if (signalListeners.size === 0) stop()
  }
}

/** Listen for connection status; fires immediately with the current state. */
export function subscribeToStatus(fn: StatusListener): () => void {
  statusListeners.add(fn)
  fn(connected)
  return () => {
    statusListeners.delete(fn)
  }
}
