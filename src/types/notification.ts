export type NotificationType = 'task-assigned' | 'task-completed' | 'comment-added' | 'deadline-reminder' | 'mention'

export interface Notification {
  _id: string
  userId: string
  type: NotificationType
  taskId?: string
  projectId?: string
  message: string
  read: boolean
  createdAt: Date
}

export interface NotificationInput {
  userId: string
  type: NotificationType
  taskId?: string
  projectId?: string
  message: string
}
