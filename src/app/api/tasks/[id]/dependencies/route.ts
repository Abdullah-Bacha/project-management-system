import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Task } from '@/lib/db/models'
import { authorizeTask } from '@/lib/auth/authorize'
import { recordActivity } from '@/lib/services/activity'
import { addDependency, listDependencies } from '@/lib/services/dependencies'
import { objectIdString, parseBody } from '@/lib/validation'

type Params = { params: Promise<{ id: string }> }

const addSchema = z.object({ blockingTaskId: objectIdString })

/**
 * What blocks this task and what it blocks. Same visibility as the task
 * itself: a developer reads the dependencies of their own tasks only.
 */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await authorizeTask(request, id, { assigneeOrEditor: true })
    if (auth.response) return auth.response

    return NextResponse.json(await listDependencies(id), { status: 200 })
  } catch (error) {
    console.error('Get dependencies error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Make another task a blocker of this one. Planning work, so the project owner
 * or team leader only, like editing the task. It never changes a status.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const auth = await authorizeTask(request, id, { editorOnly: true })
    if (auth.response) return auth.response

    const body = await parseBody(request, addSchema)
    if (body.response) return body.response

    const { userId, task } = auth.data
    const result = await addDependency({ task, blockingTaskId: body.data.blockingTaskId, userId })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    // One feed entry, recorded only now that the relationship exists.
    await recordActivity({
      projectId: task.projectId,
      actorId: userId,
      type: 'DEPENDENCY_ADDED',
      taskId: task._id,
      metadata: { relatedTaskId: result.blocking._id },
    })
    // Both tasks changed from a viewer's point of view; the existing task signal carries that to open boards.
    await Task.updateMany({ _id: { $in: [task._id, result.blocking._id] } }, { $set: { updatedAt: new Date() } })

    return NextResponse.json({ message: 'Dependency added', dependency: { _id: String(result.dependency._id) } }, { status: 201 })
  } catch (error) {
    console.error('Add dependency error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
