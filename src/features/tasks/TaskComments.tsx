'use client'

import { useCallback, useRef, useState } from 'react'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { tasksService } from '@/services/tasks.service'
import { useLoad } from '@/hooks/useLoad'
import { useRealtimeEvent } from '@/hooks/useRealtimeData'
import { Avatar } from '@/components/ui/Avatar'
import type { ChangeSignal } from '@/types'

/**
 * A task's comments — the feedback channel every project member has,
 * regardless of edit rights. New comments from other people appear as they
 * are posted; ours are added from the API response.
 */
export function TaskComments({ taskId }: { taskId: string }) {
  const comments = useLoad(() => tasksService.getComments(taskId), [taskId])
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const knownRef = useRef(comments.data)
  knownRef.current = comments.data

  // Someone else commented on THIS task (the server scopes signals to
  // members of its project). Ids we already hold — our own post — are skipped.
  const onSignal = useCallback(
    (signal: ChangeSignal) => {
      if (knownRef.current?.some((c) => c._id === signal.id)) return
      void comments.reload()
    },
    [comments]
  )
  useRealtimeEvent(['comments'], onSignal, (signal) => signal.taskId === taskId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return

    setPosting(true)
    setError('')
    try {
      const created = await tasksService.addComment(taskId, text.trim())
      comments.setData((prev) =>
        prev?.some((c) => c._id === created._id) ? prev : [created, ...(prev ?? [])]
      )
      setText('')
    } catch {
      setError('Failed to post comment')
    } finally {
      setPosting(false)
    }
  }

  const list = comments.data ?? []

  return (
    <section className="border-t border-hairline pt-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
        <MessageSquare className="h-4 w-4 text-ink-muted" />
        Comments
        <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">
          {list.length}
        </span>
      </h3>

      <form onSubmit={handleSubmit} className="mb-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write feedback…"
          className="h-10 flex-1 rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-focus focus:outline-none focus:ring-4 focus:ring-focus/12"
        />
        <button
          type="submit"
          disabled={posting || !text.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-interactive text-on-brand transition-colors hover:bg-interactive-hover disabled:opacity-40"
          aria-label="Post comment"
        >
          {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-critical-strong">{error}</p>}

      {comments.loading ? (
        <div className="skeleton h-14 rounded-xl" />
      ) : comments.error && !list.length ? (
        <p className="py-4 text-center text-xs text-critical-strong">
          Could not load comments.{' '}
          <button onClick={comments.reload} className="font-medium underline">
            Try again
          </button>
        </p>
      ) : list.length === 0 ? (
        <p className="py-4 text-center text-xs text-ink-faint">No comments yet</p>
      ) : (
        <ul className="space-y-3">
          {list.map((c) => (
            <li key={c._id} className="flex gap-3">
              <Avatar name={c.userId?.name} size="sm" />
              <div className="min-w-0 flex-1 rounded-xl bg-surface-sunken px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-ink">
                    {c.userId?.name ?? 'Unknown'}
                  </span>
                  <span className="text-[11px] text-ink-faint">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-0.5 break-words text-sm text-ink-soft">{c.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
