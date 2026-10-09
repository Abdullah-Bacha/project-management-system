'use client'

import { CheckCheck, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { notificationsService } from '@/services/notifications.service'
import { errorMessage } from '@/services/client'
import { useToast } from '@/hooks/useToast'
import { broadcastNotificationSync, bulkReadState, useBulkReadPending } from './notificationSync'

interface MarkAllReadButtonProps {
  /** How many are unread right now. With none the button is not shown (nothing to do). */
  unreadCount: number
  /** `icon`: a compact icon button (the header); `full`: icon and the words "Mark all as read". */
  variant?: 'icon' | 'full'
  className?: string
}

/**
 * Marks all of the signed-in person's unread notifications as read, in one
 * click. Every place that shows notifications (the badge, the list, the
 * dashboard card) changes at once, then reloads from the database to match it.
 * The success message waits for the server; a failure puts everything back and
 * leaves the button ready to try again. One click at a time: while a request is
 * running the button does nothing.
 *
 * Mount it always (it shows or hides its own button), so the message is not
 * lost when the last unread notification disappears and the button goes away.
 */
export function MarkAllReadButton({ unreadCount, variant = 'full', className }: MarkAllReadButtonProps) {
  const pending = useBulkReadPending()
  const { notify, toastNode } = useToast()

  const run = async () => {
    if (bulkReadState.get()) return // a second click while the first is still running does nothing
    bulkReadState.set(true)
    broadcastNotificationSync('optimistic')
    try {
      const result = await notificationsService.markAllAsRead()
      broadcastNotificationSync('confirmed')
      notify('success', result.updated > 0 ? `${result.updated} ${result.updated === 1 ? 'notification' : 'notifications'} marked as read` : 'You are all caught up')
    } catch (e) {
      broadcastNotificationSync('rollback')
      notify('error', errorMessage(e, 'Could not mark notifications as read. Please try again.'))
    } finally {
      bulkReadState.set(false)
    }
  }

  const show = unreadCount > 0 || pending

  return (
    <>
      {show && (
        <button
          type="button"
          onClick={() => void run()}
          disabled={pending}
          aria-busy={pending}
          aria-label="Mark all as read"
          title="Mark all as read"
          className={clsx(
            'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors duration-150',
            'text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-focus',
            'disabled:cursor-wait disabled:opacity-60',
            variant === 'icon' ? 'h-9 w-9' : 'h-10 border border-hairline bg-surface px-3.5',
            className
          )}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
          {variant === 'full' && <span>{pending ? 'Marking…' : 'Mark all as read'}</span>}
        </button>
      )}
      {toastNode}
    </>
  )
}
