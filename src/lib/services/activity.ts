import { Activity, Task, User } from '@/lib/db/models'
import type { ActivityItem, ActivityPage, ActivityType, TaskStatus } from '@/types'

export const ACTIVITY_PAGE_SIZE = 20

interface RecordInput {
  projectId: unknown
  actorId: unknown
  type: ActivityType
  taskId?: unknown
  commentId?: unknown
  metadata?: {
    from?: TaskStatus
    to?: TaskStatus
    assigneeId?: unknown
    previousAssigneeId?: unknown
    fileName?: string
    relatedTaskId?: unknown
  }
}

/**
 * Write one entry in a project's feed. Called from the server-side action that
 * actually happened (never from the client), once per action. Like
 * notifications, the feed is a side effect: a failure here is logged and must
 * never fail the operation that triggered it.
 */
export async function recordActivity(input: RecordInput) {
  try {
    await Activity.create(input)
  } catch (error) {
    console.error('[activity] record failed:', error)
  }
}

/** The feed entry a status change produces; moves that are not worth a line (back to To Do) return null. */
export function activityForMove(previous: TaskStatus, next: TaskStatus): ActivityType | null {
  if (previous === 'todo' && next === 'in-progress') return 'TASK_STARTED'
  if (previous === 'in-progress' && next === 'review') return 'TASK_SUBMITTED_FOR_REVIEW'
  if (previous === 'review' && next === 'in-progress') return 'TASK_SENT_BACK'
  if (previous === 'review' && next === 'complete') return 'TASK_COMPLETED'
  if (previous === 'complete' && next === 'in-progress') return 'TASK_REOPENED'
  return null
}

const idOf = (value: any): string | undefined => {
  const raw = value?._id ?? value
  return raw ? String(raw) : undefined
}

/**
 * A project's feed, newest first.
 *
 * Project members see the project's activity, with one exception that keeps
 * the existing task rule intact: a developer is not shown teammates' tasks, so
 * their feed holds only what happened on their own tasks and what they did.
 */
export async function listActivity(params: {
  projectId: string
  viewerId: string
  /** Project owner or team leader: sees everything. */
  isEditor: boolean
  skip?: number
  limit?: number
}): Promise<ActivityPage> {
  const { projectId, viewerId, isEditor, skip = 0, limit = ACTIVITY_PAGE_SIZE } = params

  const filter: Record<string, unknown> = { projectId }
  if (!isEditor) {
    const own = await Task.find({ projectId, assignedTo: viewerId }).select('_id').lean()
    filter.$or = [{ taskId: { $in: own.map((t: any) => t._id) } }, { actorId: viewerId }]
  }

  // One extra row tells us whether there is another page.
  const rows: any[] = await Activity.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(limit + 1)
    .populate('actorId', 'name profilePicture')
    .populate('taskId', 'title')
    .populate('metadata.relatedTaskId', 'title')
    .lean()

  const page = rows.slice(0, limit)

  const assigneeIds = [...new Set(page.map((r) => idOf(r.metadata?.assigneeId)).filter((v): v is string => Boolean(v)))]
  const people: any[] = assigneeIds.length ? await User.find({ _id: { $in: assigneeIds } }).select('name').lean() : []
  const nameById = new Map(people.map((p) => [String(p._id), p.name as string]))

  const activities: ActivityItem[] = page.map((r) => {
    const assigneeId = idOf(r.metadata?.assigneeId)
    return {
      _id: String(r._id),
      type: r.type,
      createdAt: new Date(r.createdAt).toISOString(),
      actor: r.actorId?._id
        ? { _id: String(r.actorId._id), name: r.actorId.name, profilePicture: r.actorId.profilePicture || undefined }
        : null,
      task: r.taskId?._id ? { _id: String(r.taskId._id), title: r.taskId.title } : null,
      ...(r.metadata?.relatedTaskId && {
        relatedTask: r.metadata.relatedTaskId._id ? { _id: String(r.metadata.relatedTaskId._id), title: r.metadata.relatedTaskId.title } : null,
      }),
      assignee: assigneeId && nameById.has(assigneeId) ? { _id: assigneeId, name: nameById.get(assigneeId)! } : null,
      ...(r.metadata?.fileName && { fileName: r.metadata.fileName as string }),
    }
  })

  return { activities, hasMore: rows.length > limit }
}
