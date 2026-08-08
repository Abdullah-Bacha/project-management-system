import { NextRequest, NextResponse } from 'next/server'
import { Task } from '@/lib/db/models'
import { authorizeTask, syncProjectProgress } from '@/lib/auth/authorize'
import { emitNotification } from '@/lib/notifications/emit'
import { z } from 'zod'

const updateStatusSchema = z.object({
  status: z.enum(['todo', 'in-progress', 'review', 'complete']),
  order: z.number().optional(),
})

/**
 * Move a task between columns — the one write action a developer has, and
 * how they report progress. An editor (admin/team_leader) can move any task
 * in the project; a developer may only move a task assigned to them.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeTask(request, id, { assigneeOrEditor: true })
    if (auth.response) return auth.response

    const { userId, task, project } = auth.data
    const body = await request.json()
    const validation = updateStatusSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    }

    const previousStatus = task.status
    const { status, order } = validation.data

    const updated = await Task.findByIdAndUpdate(
      id,
      // Only touch order when the caller supplies one; the old code reset
      // every reordered task to 0.
      { status, ...(order !== undefined && { order }) },
      { new: true }
    )
      .populate('assignedTo', 'name email profilePicture')
      .populate('createdBy', 'name email')

    await syncProjectProgress(task.projectId)

    if (status === 'complete' && previousStatus !== 'complete') {
      await emitNotification({
        userId: updated!.createdBy?._id ?? updated!.createdBy,
        actorId: userId,
        type: 'task-completed',
        message: `"${updated!.title}" was completed`,
        taskId: task._id,
        projectId: project._id,
      })
    }

    return NextResponse.json(
      { message: 'Task status updated', task: updated },
      { status: 200 }
    )
  } catch (error) {
    console.error('Update task status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
