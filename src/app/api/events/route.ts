import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth/middleware'
import { subscribe } from '@/lib/realtime/bus'

/**
 * Server-Sent Events endpoint. Each connected client holds this response
 * open and receives one `data:` frame per database change signal. The
 * client connects with fetch + a Bearer header (EventSource cannot send
 * headers), so the standard auth middleware applies unchanged.
 */
export const dynamic = 'force-dynamic'

// Hold the connection as long as the host allows. On a persistent Node host
// this is effectively unbounded; on a serverless platform the function is
// cut at its ceiling and the client reconnects (see REALTIME_SETUP.md).
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const { user, error } = await authenticateRequest(request)
  if (error || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let unsubscribe: (() => void) | null = null
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      const send = (text: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          cleanup()
        }
      }

      const cleanup = () => {
        if (closed) return
        closed = true
        if (heartbeat) clearInterval(heartbeat)
        unsubscribe?.()
        try {
          controller.close()
        } catch {
          // Already closed by the runtime.
        }
      }

      send('retry: 3000\n\n')

      unsubscribe = subscribe((signal) => {
        send(`data: ${JSON.stringify(signal)}\n\n`)
      })

      // Comment frames keep proxies from idling the connection out and let
      // the runtime detect dead clients via the failed enqueue.
      heartbeat = setInterval(() => send(': ping\n\n'), 25000)

      request.signal.addEventListener('abort', cleanup)
    },
    cancel() {
      closed = true
      if (heartbeat) clearInterval(heartbeat)
      unsubscribe?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
