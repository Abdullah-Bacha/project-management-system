import { Activity, Task, Comment, Notification, Project, Team, User } from '@/lib/db/models'
import type { MyTasksPage, TaskPriority, TaskStatus } from '@/types'
import { TASK_STATUS_LABELS, checkTransition, statusTimestamps } from '@/lib/task-status'
import { formatDuration } from '@/lib/format'
import { actorName, emitNotification } from './notifications'
import { allOf, dueFilter, textFilter } from './task-search'
import type { DueFilter } from '@/lib/due-date'
import { activityForMove, recordActivity } from './activity'
import { deleteTaskAttachments } from './attachments'
import { deleteTaskDependencies } from './dependencies'
import { isProjectMember } from '@/lib/auth/membership'
import { syncProjectProgress } from './projects'

const MAX_SCANNED = 200

export const ASSIGNEE_ERROR = 'Assignee must be an existing member of this project'

/**
 * May `assignedTo` be given a task in `project`? The user must exist and
 * belong to it (owner, team-derived or hand-added member). Callers answer
 * "no" with ASSIGNEE_ERROR for both cases, so the endpoint cannot be used to
 * probe which user ids exist.
 */
export async function isValidAssignee(project: any, assignedTo: string): Promise<boolean> {
  const id = assignedTo.toLowerCase() // ids are compared as lowercase hex strings
  if (!isProjectMember(project, id)) return false
  return Boolean(await User.exists({ _id: id }))
}

/** Delete a task with its comments and notifications, then refresh progress. */
export async function deleteTaskCascade(taskId: string, projectId: unknown) {
  // Files first, while the records that point at them still exist.
  await deleteTaskAttachments(taskId)
  await Promise.all([
    Comment.deleteMany({ taskId }),
    Notification.deleteMany({ taskId }),
    Activity.deleteMany({ taskId }),
    deleteTaskDependencies(taskId),
    Task.findByIdAndDelete(taskId),
  ])
  await syncProjectProgress(projectId)
}

const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3 } as const

/**
 * The tasks assigned to a user (open ones, plus finished ones on request), across
 * the projects they still belong to
 * (an assignment on a project they were removed from is not shown). Soonest due
 * date first, undated tasks last, ties broken by priority.
 */
export async function listMyTasks(
  userId: string,
  limit: number,
  includeCompleted = false,
  filters: { q?: string; status?: TaskStatus; priority?: TaskPriority; projectId?: string; due?: DueFilter; today?: string } = {}
): Promise<MyTasksPage> {
  const projects = await Project.find({ $or: [{ owner: userId }, { members: userId }] })
    .select('title')
    .lean()
  const titleById = new Map(projects.map((p) => [String(p._id), p.title as string]))

  // A project filter can only pick among the projects the user belongs to.
  const projectIds = projects
    .map((p) => p._id)
    .filter((projectId) => !filters.projectId || String(projectId) === filters.projectId)

  const tasks = await Task.find(
    allOf(
      {
        projectId: { $in: projectIds },
        assignedTo: userId,
        ...(filters.status && { status: filters.status }),
        ...(filters.priority && { priority: filters.priority }),
      },
      textFilter(filters.q),
      dueFilter(filters.due, filters.today)
    )
  )
    .select('title status priority dueDate projectId createdBy startedAt completedAt')
    .populate('createdBy', 'name')
    .limit(MAX_SCANNED)
    .lean()

  const dueAt = (t: { dueDate?: Date | null }) => (t.dueDate ? new Date(t.dueDate).getTime() : Infinity)
  // Finished tasks (only present when asked for) go last; open ones by due date.
  const doneRank = (t: { status?: string }) => (t.status === 'complete' ? 1 : 0)
  const sorted = [...tasks].sort(
    (a, b) => doneRank(a) - doneRank(b) || dueAt(a) - dueAt(b) || PRIORITY_RANK[a.priority as keyof typeof PRIORITY_RANK] - PRIORITY_RANK[b.priority as keyof typeof PRIORITY_RANK]
  )

  // Overdue means a due DAY before today (the viewer's date when sent, else the server's UTC date), not a time of day.
  const todayStart = Date.parse(`${filters.today ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`)
  const counts: MyTasksPage['counts'] = { todo: 0, 'in-progress': 0, review: 0, complete: 0 }
  for (const t of sorted) counts[t.status as TaskStatus] += 1

  const visible = includeCompleted ? sorted : sorted.filter((t) => t.status !== 'complete')

  return {
    total: sorted.filter((t) => t.status !== 'complete').length,
    overdue: sorted.filter((t) => t.status !== 'complete' && dueAt(t) < todayStart).length,
    counts,
    tasks: visible.slice(0, limit).map((t) => ({
      _id: String(t._id),
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : undefined,
      startedAt: t.startedAt ? new Date(t.startedAt).toISOString() : undefined,
      completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : undefined,
      assignedBy: (t.createdBy as { name?: string } | null)?.name,
      project: { _id: String(t.projectId), title: titleById.get(String(t.projectId)) ?? '' },
    })),
  }
}

export type MoveResult =
  | { ok: true; task: any }
  | { ok: false; status: 400 | 403; error: string }

/**
 * Move a task to another status. This is the single place that applies the
 * workflow: it checks the transition for this actor, stamps startedAt /
 * completedAt with the server clock, refreshes the project's progress and
 * sends the (few) notifications the workflow calls for.
 */
export async function moveTask(params: {
  task: any
  project: any
  actorId: string
  /** Project owner or team leader (otherwise treated as the assigned developer). */
  isEditor: boolean
  status: TaskStatus
  order?: number
  /** The status before this change, when `task` was already re-read after other edits. */
  previousStatus?: TaskStatus
}): Promise<MoveResult> {
  const { task, project, actorId, isEditor, status, order } = params
  const previous: TaskStatus = params.previousStatus ?? task.status

  const check = checkTransition(isEditor ? 'leader' : 'developer', previous, status)
  if (check === 'forbidden') {
    return { ok: false, status: 403, error: 'Only the team leader can make this change' }
  }
  if (check === 'invalid') {
    return {
      ok: false,
      status: 400,
      error: `A task cannot move from ${TASK_STATUS_LABELS[previous]} to ${TASK_STATUS_LABELS[status]}`,
    }
  }

  const stamps = statusTimestamps(previous, status, task)
  const update: Record<string, any> = {
    $set: { status, ...(order !== undefined && { order }), ...stamps.set },
  }
  if (stamps.unset.length) update.$unset = Object.fromEntries(stamps.unset.map((k) => [k, '']))

  const updated = await Task.findByIdAndUpdate(task._id, update, { new: true })
    .populate('assignedTo', 'name email profilePicture')
    .populate('createdBy', 'name email')

  if (check === 'ok') {
    await syncProjectProgress(task.projectId)

    const type = activityForMove(previous, status)
    if (type) {
      await recordActivity({
        projectId: project._id,
        actorId,
        type,
        taskId: task._id,
        metadata: {
          from: previous,
          to: status,
          ...(type === 'TASK_SENT_BACK' && idOf(updated?.assignedTo) && { assigneeId: idOf(updated.assignedTo) }),
        },
      })
    }

    await notifyTransition(updated, previous, status, project, actorId)
  }

  return { ok: true, task: updated }
}

const idOf = (value: any): string | undefined => {
  const raw = value?._id ?? value
  return raw ? String(raw) : undefined
}

/** The people who review a task: whoever created it and the leader of the project's team. */
async function reviewerIds(project: any, task: any): Promise<string[]> {
  const ids = new Set<string>()
  const creator = idOf(task.createdBy)
  if (creator) ids.add(creator)

  if (project.team) {
    const team = await Team.findById(project.team).select('teamLeader').lean()
    const leader = idOf((team as any)?.teamLeader)
    if (leader) ids.add(leader)
  }
  return [...ids]
}

/**
 * Only the moments that need someone's attention produce a notification:
 * submitted for review (the leader), sent back / reopened / completed (the
 * developer). Starting a task or stepping back to To Do does not.
 */
async function notifyTransition(task: any, previous: TaskStatus, status: TaskStatus, project: any, actorId: string) {
  const common = { actorId, taskId: task._id, projectId: project._id }
  const assignee = idOf(task.assignedTo)

  if (status === 'review') {
    const who = await actorName(actorId)
    for (const userId of await reviewerIds(project, task)) {
      await emitNotification({
        ...common,
        userId,
        type: 'task-updated',
        message: `${who} submitted "${task.title}" for review`,
      })
    }
    return
  }

  if (!assignee) return

  if (previous === 'review' && status === 'in-progress') {
    await emitNotification({ ...common, userId: assignee, type: 'task-updated', message: `"${task.title}" was sent back for changes` })
  } else if (previous === 'complete' && status === 'in-progress') {
    await emitNotification({ ...common, userId: assignee, type: 'task-updated', message: `"${task.title}" was reopened` })
  } else if (status === 'complete') {
    const elapsed = formatDuration(task.startedAt, task.completedAt)
    await emitNotification({
      ...common,
      userId: assignee,
      type: 'task-completed',
      message: `"${task.title}" was completed${elapsed ? ` (elapsed ${elapsed})` : ''}`,
    })
  }
}
