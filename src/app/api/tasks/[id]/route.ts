import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { Task, Comment, Notification } from '@/lib/db/models'
import { authorizeTask, syncProjectProgress } from '@/lib/auth/authorize'
import { emitNotification } from '@/lib/notifications/emit'
import { z } from 'zod'

const updateTaskSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  status: z.enum(['todo', 'in-progress', 'review', 'complete']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  // null clears the assignee.
  assignedTo: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
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
    const auth = await authorizeTask(request, id, {
      populate: ['assignedTo', 'createdBy'],
    })
    if (auth.response) return auth.response

    return NextResponse.json({ task: auth.data.task }, { status: 200 })
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
    const body = await request.json()
    const validation = updateTaskSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.issues },
        { status: 400 }
      )
    }

    const data = validation.data
    const previousAssignee = task.assignedTo?.toString()
    const previousStatus = task.status

    // Build an explicit update so null values clear the field rather than
    // being written as null into an ObjectId/Date path.
    const update: Record<string, any> = {}
    const unset: Record<string, ''> = {}

    for (const [key, value] of Object.entries(data)) {
      if (value === null) unset[key] = ''
      else if (value !== undefined) update[key] = value
    }

    const updated = await Task.findByIdAndUpdate(
      id,
      { ...(Object.keys(update).length && update), $unset: unset },
      { new: true, runValidators: true }
    )
      .populate('assignedTo', 'name email profilePicture')
      .populate('createdBy', 'name email')

    if (data.status && data.status !== previousStatus) {
      await syncProjectProgress(task.projectId)
    }

    if (data.assignedTo && data.assignedTo !== previousAssignee) {
      await emitNotification({
        userId: data.assignedTo,
        actorId: userId,
        type: 'task-assigned',
        message: `You were assigned "${updated!.title}" in ${project.title}`,
        taskId: task._id,
        projectId: project._id,
      })
    }

    if (data.status === 'complete' && previousStatus !== 'complete') {
      const notifyee = updated!.createdBy?._id ?? updated!.createdBy
      await emitNotification({
        userId: notifyee,
        actorId: userId,
        type: 'task-completed',
        message: `"${updated!.title}" was completed`,
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

    const projectId = auth.data.task.projectId as mongoose.Types.ObjectId

    await Promise.all([
      Comment.deleteMany({ taskId: id }),
      Notification.deleteMany({ taskId: id }),
      Task.findByIdAndDelete(id),
    ])

    await syncProjectProgress(projectId)

    return NextResponse.json({ message: 'Task deleted successfully' }, { status: 200 })
  } catch (error) {
    console.error('Delete task error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
