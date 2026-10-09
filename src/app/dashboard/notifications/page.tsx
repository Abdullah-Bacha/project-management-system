'use client'

import { Bell } from 'lucide-react'
import { useNotifications } from '@/features/notifications/useNotifications'
import { NotificationItem } from '@/features/notifications/NotificationItem'
import { EmptyState, ErrorState } from '@/components/ui/PageState'

export default function NotificationsPage() {
  const { notifications, unreadCount, isLoading, error, errorStatus, refetch, markAsRead } =
    useNotifications()

  // A failed first load must not look like "still loading".
  const failed = !isLoading && error && notifications.length === 0

  return (
    <div>
      <header className="animate-rise mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Notifications</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {isLoading
            ? 'Loading…'
            : unreadCount > 0
              ? `${unreadCount} unread`
              : 'You are all caught up'}
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-card" />
          ))}
        </div>
      ) : failed ? (
        <ErrorState message={error} status={errorStatus} onRetry={refetch} />
      ) : notifications.length === 0 ? (
        <EmptyState icon={<Bell className="h-6 w-6" />} title="Nothing here yet">
          Assignments, comments and deadline reminders will show up here.
        </EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {notifications.map((notification, i) => (
            <NotificationItem
              key={notification._id}
              notification={notification}
              index={i}
              onMarkRead={markAsRead}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
