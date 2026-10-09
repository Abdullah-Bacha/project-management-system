import { NextRequest, NextResponse } from 'next/server'
import { authorizeTask } from '@/lib/auth/authorize'
import { moveTask } from '@/lib/services/tasks'
import { TASK_STATUSES } from '@/types'
import { z } from 'zod'
import { parseBody } from '@/lib/validation'

const updateStatusSchema = z.object({
  status: z.enum(TASK_STATUSES),
  order: z.number().optional(),
})

/**
 * Move a task along To Do → In Progress → In Review → Complete.
 *
 * A developer may move only their own task, and only forward to In Review (or
 * back to To Do); the project owner / team leader reviews: sends a task back,
 * completes it, or reopens it. The rules, the server-side startedAt /
 * completedAt stamps and the notifications all live in `moveTask`.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeTask(request, id, { assigneeOrEditor: true })
    if (auth.response) return auth.response

    const { userId, task, project, isEditor } = auth.data
    const validation = await parseBody(request, updateStatusSchema)
    if (validation.response) return validation.response

    const moved = await moveTask({
      task,
      project,
      actorId: userId,
      isEditor: Boolean(isEditor),
      status: validation.data.status,
      order: validation.data.order,
    })
    if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: moved.status })

    return NextResponse.json({ message: 'Task status updated', task: moved.task }, { status: 200 })
  } catch (error) {
    console.error('Update task status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
