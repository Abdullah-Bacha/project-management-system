'use client'

import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Send } from 'lucide-react'
import { messageService } from '@/services/team.service'
import { useAuth } from '@/hooks/useAuth'
import { useLoad } from '@/hooks/useLoad'
import { useRealtimeEvent } from '@/hooks/useRealtimeData'
import { Button } from '@/components/ui/Button'
import type { DirectMessage, UserSummary } from '@/types'

/** Live 1:1 conversation with one teammate. */
export function TeamMemberChat({ member }: { member: UserSummary }) {
  const { user } = useAuth()
  const { data, loading, error, reload, setData } = useLoad(
    () => messageService.list(member._id),
    [member._id]
  )
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  // Any message change involving me: refetch (also marks theirs as read).
  useRealtimeEvent(['messages'], () => void reload())

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [data?.length])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    setSendError(null)
    try {
      const message = await messageService.send(member._id, value)
      setText('')
      setData((cur: DirectMessage[] | null) =>
        cur?.some((m) => m._id === message._id) ? cur : [...(cur ?? []), message]
      )
    } catch (err: any) {
      setSendError(err?.response?.data?.error || 'Could not send the message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {loading ? (
          <div className="skeleton h-10 w-2/3 rounded-lg" />
        ) : error && !data ? (
          <p className="text-sm text-critical-strong">{error}</p>
        ) : !data?.length ? (
          <p className="py-10 text-center text-sm text-ink-muted">
            No messages yet. Say hello to {member.name.split(' ')[0]}!
          </p>
        ) : (
          data.map((m) => {
            const mine = m.sender === user?._id
            return (
              <div key={m._id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={clsx(
                    'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm',
                    mine
                      ? 'rounded-br-sm bg-interactive text-on-brand'
                      : 'rounded-bl-sm bg-surface-sunken text-ink'
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                  <p className={clsx('mt-0.5 text-[10px]', mine ? 'text-on-brand/70' : 'text-ink-faint')}>
                    {new Date(m.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="shrink-0 border-t border-hairline p-4">
        {sendError && <p className="mb-2 text-xs text-critical-strong">{sendError}</p>}
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder={`Message ${member.name}…`}
            className="h-10 min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
          <Button type="submit" disabled={!text.trim() || sending} aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )
}
