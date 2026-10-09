import mongoose from 'mongoose'
import { Notification, User } from '@/lib/db/models'
import type { NotificationType } from '@/types'

type Id = mongoose.Types.ObjectId | string

interface EmitOptions {
  /** Who should see this. Self-notifications are skipped. */
  userId: Id
  /** The user causing the event; never notified about their own action. */
  actorId: Id
  type: NotificationType
  message: string
  taskId?: Id
  projectId?: Id
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

/** Display name for messages like "Ali assigned you …"; falls back to "Someone". */
export async function actorName(userId: Id): Promise<string> {
  try {
    const user = await User.findById(userId).select('name').lean()
    return (user as { name?: string } | null)?.name || 'Someone'
  } catch {
    return 'Someone'
  }
}

/** Tell each person (once) that their team was staffed on a project. */
export async function notifyProjectAssigned(
  project: { _id: Id; title: string },
  userIds: Iterable<string>,
  actorId: Id
) {
  await Promise.all(
    [...new Set(userIds)].map((userId) =>
      emitNotification({
        userId,
        actorId,
        type: 'project-assigned',
        message: `Your team was assigned to "${project.title}"`,
        projectId: project._id,
      })
    )
  )
}
