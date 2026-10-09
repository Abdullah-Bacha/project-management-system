'use client'

import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { Activity } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { Modal } from '@/components/ui/Modal'
import { StatsCard } from '@/components/ui/StatsCard'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { FALLBACK_STYLE, TYPE_STYLES } from '@/features/notifications/NotificationItem'
import { MarkAllReadButton } from '@/features/notifications/MarkAllReadButton'
import { useNotificationSync } from '@/features/notifications/notificationSync'
import { timeAgo } from '@/lib/format'
import type { Notification, NotificationPage } from '@/types'

/** Where a notification leads: the task's board, the project, or the inbox. */
function hrefFor(n: Notification) {
  if (n.projectId?._id) {
    return n.taskId ? `/dashboard/projects/${n.projectId._id}?task=${n.taskId._id}` : `/dashboard/projects/${n.projectId._id}`
  }
  return '/dashboard/notifications'
}

/**
 * Recent activity is the user's own notifications — the only activity record
 * the system keeps. Nothing is invented to fill the space.
 *
 * On the dashboard it is one card (the number of unread items, and the latest
 * line); opening it shows the list.
 */
export function RecentActivity({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const { data, isLoading, error, errorStatus, refetch, mutate } = useRealtimeData<NotificationPage>({
    endpoint: '/api/notifications?skip=0&limit=20',
    watch: ['notifications'],
  })
  useNotificationSync(mutate, refetch)
  const items = data?.notifications ?? []
  const unread = data?.unreadCount

  const hint = !data
    ? error
      ? 'Could not load, click to retry'
      : 'Loading…'
    : items.length === 0
      ? 'Nothing yet'
      : unread
        ? `${unread} unread · ${items[0].message}`
        : items[0].message

  return (
    <div className={clsx('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      <StatsCard
        label="Recent activity"
        value={data ? (unread ?? 0) : '—'}
        hint={hint}
        icon={<Activity className="h-5 w-5" />}
        tone={unread ? 'brand' : 'positive'}
        onClick={() => setOpen(true)}
      />

      {open && (
        <Modal title="Recent activity" placement="right" onClose={() => setOpen(false)}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && !data ? (
              <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading activity">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-10 rounded-lg" />
                ))}
              </div>
            ) : error && !data ? (
              <ErrorState compact message={error} status={errorStatus} onRetry={refetch} />
            ) : items.length === 0 ? (
              <div className="p-5">
                <EmptyState compact icon={<Activity className="h-6 w-6" />} title="No recent activity">
                  Task assignments, comments and deadlines will appear here.
                </EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-hairline">
                {items.map((n) => {
                  const { icon: Icon, chip } = TYPE_STYLES[n.type] ?? FALLBACK_STYLE
                  return (
                    <li key={n._id}>
                      <Link
                        href={hrefFor(n)}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 px-5 py-3 transition-colors duration-200 hover:bg-surface-sunken"
                      >
                        <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', chip)}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={clsx('break-words text-sm text-ink', !n.read && 'font-medium')}>{n.message}</p>
                          <p className="mt-0.5 text-xs text-ink-faint">{timeAgo(n.createdAt)}</p>
                        </div>
                        {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-interactive" aria-label="Unread" />}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          {items.length > 0 && (
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-hairline p-4">
              <Link href="/dashboard/notifications" className="text-sm font-medium text-interactive hover:text-interactive-hover">
                View all notifications
              </Link>
              <MarkAllReadButton unreadCount={unread ?? 0} />
            </footer>
          )}
        </Modal>
      )}
    </div>
  )
}
