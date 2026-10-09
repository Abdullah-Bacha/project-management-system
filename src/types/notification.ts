export const NOTIFICATION_TYPES = [
  'task-assigned',
  'task-completed',
  'task-updated',
  'comment-added',
  'deadline-reminder',
  'mention',
  'project-assigned',
  'report-submitted',
  'new-message',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export interface Notification {
  _id: string
  userId: string
  type: NotificationType
  taskId?: { _id: string; title: string } | null
  projectId?: { _id: string; title: string } | null
  message: string
  read: boolean
  createdAt: string
}

export interface NotificationPage {
  notifications: Notification[]
  total: number
  unreadCount: number
}
