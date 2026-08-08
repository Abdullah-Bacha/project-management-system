import mongoose from 'mongoose'
import { Notification } from '@/lib/db/models'

type NotificationType =
  | 'task-assigned'
  | 'task-completed'
  | 'comment-added'
  | 'deadline-reminder'
  | 'mention'
  | 'project-assigned'
  | 'report-submitted'

interface EmitOptions {
  /** Who should see this. Self-notifications are skipped. */
  userId: mongoose.Types.ObjectId | string
  /** The user causing the event; never notified about their own action. */
  actorId: mongoose.Types.ObjectId | string
  type: NotificationType
  message: string
  taskId?: mongoose.Types.ObjectId | string
  projectId?: mongoose.Types.ObjectId | string
}

/**
 * Record a notification for a user.
 *
 * Notifications are a side effect of the main request — a failure here must
 * never fail the operation that triggered it, so errors are logged and
 * swallowed.
 */
export async function emitNotification({
  userId,
  actorId,
  type,
  message,
  taskId,
  projectId,
}: EmitOptions) {
  try {
    if (!userId) return
    if (userId.toString() === actorId.toString()) return

    await Notification.create({ userId, type, message, taskId, projectId })
  } catch (error) {
    console.error('[notifications] emit failed:', error)
  }
}

/** Notify every project member except the actor. */
export async function emitToProject(
  project: any,
  options: Omit<EmitOptions, 'userId'>
) {
  const recipients = new Set<string>()

  const owner = project.owner?._id ?? project.owner
  if (owner) recipients.add(owner.toString())

  for (const member of project.members ?? []) {
    const id = member?._id ?? member
    if (id) recipients.add(id.toString())
  }

  await Promise.all(
    [...recipients].map((userId) =>
      emitNotification({ ...options, userId, projectId: project._id })
    )
  )
}
