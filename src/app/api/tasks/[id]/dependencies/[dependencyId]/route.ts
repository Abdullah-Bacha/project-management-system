import mongoose from 'mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { Task } from '@/lib/db/models'
import { authorizeTask } from '@/lib/auth/authorize'
import { recordActivity } from '@/lib/services/activity'
import { removeDependency } from '@/lib/services/dependencies'

type Params = { params: Promise<{ id: string; dependencyId: string }> }

/**
 * Remove a relationship. The task is authorized first and the relationship is
 * looked up only through it, so a dependency id from another task or project
 * is simply not found.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const { id, dependencyId } = await params
    const auth = await authorizeTask(request, id, { editorOnly: true })
    if (auth.response) return auth.response

    if (!mongoose.isValidObjectId(dependencyId)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const removed = await removeDependency(id, dependencyId)
    if (!removed) return NextResponse.json({ error: 'Dependency not found' }, { status: 404 })

    const { userId, task } = auth.data
    const blocked = String(removed.blockedTaskId)
    await recordActivity({
      projectId: task.projectId,
      actorId: userId,
      type: 'DEPENDENCY_REMOVED',
      taskId: blocked,
      metadata: { relatedTaskId: removed.blockingTaskId },
    })
    await Task.updateMany({ _id: { $in: [removed.blockedTaskId, removed.blockingTaskId] } }, { $set: { updatedAt: new Date() } })

    return NextResponse.json({ message: 'Dependency removed' }, { status: 200 })
  } catch (error) {
    console.error('Remove dependency error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
