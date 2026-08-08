'use client'

import { useState, useEffect } from 'react'
import clsx from 'clsx'
import {
  ClipboardList,
  CheckCircle2,
  MessageSquare,
  Clock,
  AtSign,
  Bell,
  Check,
} from 'lucide-react'
import { notificationsService } from '@/services/notifications.service'
import { Notification } from '@/types'

const icons: Record<string, { icon: typeof Bell; chip: string }> = {
  'task-assigned': { icon: ClipboardList, chip: 'bg-brand-50 text-brand-600' },
  'task-completed': { icon: CheckCircle2, chip: 'bg-positive/10 text-positive' },
  'comment-added': { icon: MessageSquare, chip: 'bg-accent/10 text-accent' },
  'deadline-reminder': { icon: Clock, chip: 'bg-caution/12 text-caution' },
  mention: { icon: AtSign, chip: 'bg-brand-50 text-brand-600' },
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    try {
      const data = await notificationsService.getAll(0, 50)
      setNotifications(data.notifications || [])
    } catch (error) {
      console.error('Failed to load notifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleMarkAsRead = async (id: string) => {
    // Flip it locally first; the list refetch below confirms it.
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, read: true } : n))
    )
    try {
      await notificationsService.markAsRead(id)
      await loadNotifications()
    } catch (error) {
      console.error('Failed to mark as read:', error)
      await loadNotifications()
    }
  }

  const unread = notifications.filter((n) => !n.read).length

  return (
    <div className="mx-auto max-w-3xl">
      <header className="animate-rise mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Notifications
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {loading
            ? 'Loading…'
            : unread > 0
              ? `${unread} unread`
              : 'You are all caught up'}
        </p>
      </header>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-20 rounded-card" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="animate-rise rounded-card border border-dashed border-hairline bg-surface p-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Bell className="h-6 w-6" />
          </span>
          <h3 className="mt-4 font-medium text-ink">Nothing here yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
            Assignments, comments and deadline reminders will show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {notifications.map((notification, i) => {
            const { icon: Icon, chip } =
              icons[notification.type] ?? {
                icon: Bell,
                chip: 'bg-surface-sunken text-ink-muted',
              }

            return (
              <li
                key={notification._id}
                className={clsx(
                  'animate-rise group flex items-start gap-3.5 rounded-card border p-4',
                  'shadow-card transition-all duration-200 hover:shadow-lifted',
                  notification.read
                    ? 'border-hairline bg-surface'
                    : 'border-brand-200 bg-brand-50/40'
                )}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <span
                  className={clsx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                    chip
                  )}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {notification.message}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {new Date(notification.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>

                {!notification.read && (
                  <button
                    onClick={() => handleMarkAsRead(notification._id)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark read
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
