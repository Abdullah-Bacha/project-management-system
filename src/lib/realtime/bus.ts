import type mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/db/mongodb'

/**
 * Server-side change bus: one MongoDB change stream fanned out to every
 * connected SSE client. Clients receive only "collection X changed" signals
 * and refetch through the normal authenticated APIs — no document data
 * travels over this channel, so per-user authorization stays where it is.
 */
export interface ChangeSignal {
  collection: string
  op: string
}

type Subscriber = (signal: ChangeSignal) => void

interface BusState {
  subscribers: Set<Subscriber>
  stream: mongoose.mongo.ChangeStream | null
  starting: Promise<void> | null
  retryTimer: ReturnType<typeof setTimeout> | null
  retryDelay: number
}

// Cached on global so dev-mode HMR reloads reuse the one stream instead of
// leaking a new one per reload — same pattern as the mongoose connection.
declare global {
  var _realtimeBus: BusState | undefined
}

const bus: BusState = global._realtimeBus ?? {
  subscribers: new Set(),
  stream: null,
  starting: null,
  retryTimer: null,
  retryDelay: 1000,
}
global._realtimeBus = bus

function broadcast(signal: ChangeSignal) {
  bus.subscribers.forEach((fn) => {
    try {
      fn(signal)
    } catch {
      // One bad subscriber must not break delivery to the rest.
    }
  })
}

function teardown() {
  if (bus.retryTimer) {
    clearTimeout(bus.retryTimer)
    bus.retryTimer = null
  }
  const stream = bus.stream
  bus.stream = null
  stream?.close().catch(() => {})
}

function scheduleRetry() {
  if (bus.retryTimer || bus.subscribers.size === 0) return
  bus.retryTimer = setTimeout(() => {
    bus.retryTimer = null
    bus.retryDelay = Math.min(bus.retryDelay * 2, 30000)
    void ensureStream()
  }, bus.retryDelay)
}

async function ensureStream(): Promise<void> {
  if (bus.stream || bus.starting || bus.subscribers.size === 0) return

  bus.starting = (async () => {
    try {
      const conn = await connectToDatabase()

      // One deployment-level stream covers every collection — Atlas free
      // tiers cap concurrent change streams, so never open one per model.
      const stream = conn.connection.watch(
        [
          {
            $match: {
              operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
            },
          },
        ],
        {}
      )

      stream.on('change', (event: any) => {
        const collection = event.ns?.coll
        if (collection) {
          broadcast({ collection, op: event.operationType })
        }
      })

      stream.on('error', (err: Error) => {
        console.error('[Realtime] Change stream error:', err.message)
        teardown()
        scheduleRetry()
      })

      bus.stream = stream
      bus.retryDelay = 1000
      console.log('[Realtime] Change stream open')
    } catch (err: any) {
      console.error('[Realtime] Failed to open change stream:', err.message)
      scheduleRetry()
    } finally {
      bus.starting = null
    }
  })()

  await bus.starting
}

/** Register an SSE connection; returns its unsubscribe function. */
export function subscribe(fn: Subscriber): () => void {
  bus.subscribers.add(fn)
  void ensureStream()

  return () => {
    bus.subscribers.delete(fn)
    // Last client gone: release the stream so an idle server holds no
    // change-stream slot on the cluster.
    if (bus.subscribers.size === 0) {
      teardown()
    }
  }
}
