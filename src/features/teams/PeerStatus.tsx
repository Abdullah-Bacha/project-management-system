'use client'

import clsx from 'clsx'
import { usePeerPresence } from '@/hooks/usePeerPresence'
import { describePresence } from '@/lib/presence'

/** "Online · active since 3:20 PM" or "Last seen yesterday at 9:05 AM", like a chat app. */
export function PeerStatus({ userId, className }: { userId: string; className?: string }) {
  const presence = usePeerPresence(userId)
  if (!presence) return <span className={clsx('block h-4', className)} aria-hidden />

  const { online, text } = describePresence(presence)
  return (
    <p className={clsx('flex min-w-0 items-center gap-1.5 text-xs', className)} aria-live="polite">
      <span aria-hidden className={clsx('h-2 w-2 shrink-0 rounded-full', online ? 'bg-positive' : 'bg-ink-faint')} />
      <span className={clsx('truncate', online ? 'font-medium text-positive-strong' : 'text-ink-muted')}>{text}</span>
    </p>
  )
}
