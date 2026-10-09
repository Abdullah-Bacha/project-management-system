import clsx from 'clsx'
import {
  Bell,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  FolderKanban,
  MessageSquare,
  RefreshCw,
  AtSign,
} from 'lucide-react'
import type { Notification, NotificationType } from '@/types'

/** One icon + chip colour per notification type. */
export const TYPE_STYLES: Record<NotificationType, { icon: typeof Bell; chip: string }> = {
  'task-assigned': { icon: ClipboardList, chip: 'bg-brand-50 text-brand-700' },
  'task-completed': { icon: CheckCircle2, chip: 'bg-positive-subtle text-positive-strong' },
  'task-updated': { icon: RefreshCw, chip: 'bg-info-subtle text-info-strong' },
  'comment-added': { icon: MessageSquare, chip: 'bg-accent-subtle text-accent-strong' },
  'deadline-reminder': { icon: Clock, chip: 'bg-caution-subtle text-caution-strong' },
  mention: { icon: AtSign, chip: 'bg-info-subtle text-info-strong' },
  'project-assigned': { icon: FolderKanban, chip: 'bg-brand-50 text-brand-700' },
  'report-submitted': { icon: FileText, chip: 'bg-info-subtle text-info-strong' },
  'new-message': { icon: MessageSquare, chip: 'bg-accent-subtle text-accent-strong' },
}

export const FALLBACK_STYLE = { icon: Bell, chip: 'bg-surface-sunken text-ink-muted' }

interface NotificationItemProps {
  notification: Notification
  /** Position in the list, for the staggered entrance. */
  index: number
  onMarkRead: (id: string) => void
}

export function NotificationItem({ notification, index, onMarkRead }: NotificationItemProps) {
  const { icon: Icon, chip } = TYPE_STYLES[notification.type] ?? FALLBACK_STYLE

  return (
    <li
      className={clsx(
        'animate-rise group flex items-start gap-3.5 rounded-card border p-4',
        'shadow-card transition-all duration-200 hover:shadow-lifted',
        notification.read ? 'border-hairline bg-surface' : 'border-brand-200 bg-brand-50/40'
      )}
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', chip)}>
        <Icon className="h-4.5 w-4.5" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{notification.message}</p>
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
          onClick={() => onMarkRead(notification._id)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100"
        >
          <Check className="h-3.5 w-3.5" />
          Mark read
        </button>
      )}
    </li>
  )
}
