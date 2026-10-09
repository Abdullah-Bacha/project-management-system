import { NextRequest, NextResponse } from 'next/server'
import { Task } from '@/lib/db/models'
import { authorizeTask } from '@/lib/auth/authorize'
import { isValidAssignee, deleteTaskCascade, moveTask, ASSIGNEE_ERROR } from '@/lib/services/tasks'
import { actorName, emitNotification } from '@/lib/services/notifications'
import { recordActivity } from '@/lib/services/activity'
import { withBlockerCounts } from '@/lib/services/dependencies'
import { TASK_STATUS_LABELS, checkTransition } from '@/lib/task-status'
import { parseBody, objectIdString } from '@/lib/validation'
import { dueDateInput } from '@/lib/services/task-search'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/types'
import { z } from 'zod'

const updateTaskSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  // null clears the assignee.
  assignedTo: objectIdString.nullable().optional(),
  dueDate: dueDateInput.nullable().optional(),
  estimatedHours: z.number().min(0).optional(),
  actualHours: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // A developer reads only their own tasks; leaders and owners read any in their project.
    const auth = await authorizeTask(request, id, {
      populate: ['assignedTo', 'createdBy'],
      assigneeOrEditor: true,
    })
    if (auth.response) return auth.response

    const [task] = await withBlockerCounts([auth.data.task])
    return NextResponse.json({ task }, { status: 200 })
  } catch (error) {
    console.error('Get task error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Full task edit — title, description, priority, assignee, dates, hours.
 * Restricted to the project's admin owner or team_leader; a developer moves
 * their own task via PUT .../status and leaves feedback via comments, but
 * doesn't rewrite the task itself.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeTask(request, id, { editorOnly: true })
    if (auth.response) return auth.response

    const { userId, task, project } = auth.data
    const body = await parseBody(request, updateTaskSchema)
    if (body.response) return body.response

    const data = body.data
    const previousAssignee = task.assignedTo?.toString()
    const previousStatus = task.status

    // A status in the edit follows the same workflow as the status route; refuse
    // an illegal move before anything is written.
    if (data.status && data.status !== previousStatus && checkTransition('leader', previousStatus, data.status) !== 'ok') {
      return NextResponse.json(
        { error: `A task cannot move from ${TASK_STATUS_LABELS[previousStatus as keyof typeof TASK_STATUS_LABELS]} to ${TASK_STATUS_LABELS[data.status]}` },
        { status: 400 }
      )
    }

    // Only a *change* of assignee is checked: a task whose current assignee
    // later left the team must stay editable without reassigning it.
    if (data.assignedTo && data.assignedTo !== previousAssignee) {
      if (!(await isValidAssignee(project, data.assignedTo))) {
        return NextResponse.json({ error: ASSIGNEE_ERROR }, { status: 400 })
      }
    }

    // Build an explicit update so null values clear the field rather than
    // being written as null into an ObjectId/Date path.
    const update: Record<string, any> = {}
    const unset: Record<string, ''> = {}

    for (const [key, value] of Object.entries(data)) {
      if (key === 'status') continue // applied below, through the workflow
      if (value === null) unset[key] = ''
      else if (value !== undefined) update[key] = value
    }

    let updated = await Task.findByIdAndUpdate(
      id,
      { ...(Object.keys(update).length && update), $unset: unset },
      { new: true, runValidators: true }
    )
      .populate('assignedTo', 'name email profilePicture')
      .populate('createdBy', 'name email')

    if (data.status && data.status !== previousStatus) {
      const moved = await moveTask({ task: updated, project, actorId: userId, isEditor: true, status: data.status, previousStatus })
      if (moved.ok) updated = moved.task
    }

    if (data.assignedTo && data.assignedTo !== previousAssignee) {
      await recordActivity({
        projectId: project._id,
        actorId: userId,
        type: 'TASK_ASSIGNED',
        taskId: task._id,
        metadata: { assigneeId: data.assignedTo, previousAssigneeId: previousAssignee },
      })
      await emitNotification({
        userId: data.assignedTo,
        actorId: userId,
        type: 'task-assigned',
        message: `${await actorName(userId)} assigned you "${updated!.title}" in ${project.title}`,
        taskId: task._id,
        projectId: project._id,
      })
    }

    return NextResponse.json({ message: 'Task updated', task: updated }, { status: 200 })
  } catch (error) {
    console.error('Update task error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeTask(request, id, { editorOnly: true })
    if (auth.response) return auth.response

    await deleteTaskCascade(id, auth.data.task.projectId)

    return NextResponse.json({ message: 'Task deleted successfully' }, { status: 200 })
  } catch (error) {
    console.error('Delete task error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
