import { NextRequest, NextResponse } from 'next/server'
import { Task } from '@/lib/db/models'
import { authorizeProject } from '@/lib/auth/authorize'
import { syncProjectProgress } from '@/lib/services/projects'
import { allOf, dueDateInput, taskSearchFilter, taskSearchShape } from '@/lib/services/task-search'
import { isValidAssignee, ASSIGNEE_ERROR } from '@/lib/services/tasks'
import { actorName, emitNotification } from '@/lib/services/notifications'
import { recordActivity } from '@/lib/services/activity'
import { withBlockerCounts } from '@/lib/services/dependencies'
import { parseBody, objectIdString } from '@/lib/validation'
import { parseFilters } from '@/lib/validation/query'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/types'
import { z } from 'zod'

const createTaskSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assignedTo: objectIdString.optional(),
  dueDate: dueDateInput.optional(),
  estimatedHours: z.number().optional(),
  tags: z.array(z.string()).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { withEditor: true })
    if (auth.response) return auth.response

    const filters = parseFilters(request.nextUrl.searchParams, {
      status: z.enum(TASK_STATUSES).optional(),
      priority: z.enum(TASK_PRIORITIES).optional(),
      ...taskSearchShape,
    })
    if (filters.response) return filters.response
    const { q, assigneeId, createdBy, due, today, ...exact } = filters.data

    // Owners and team leaders manage the whole project; everyone else sees only their own tasks.
    const scope = auth.data.isEditor ? {} : { assignedTo: auth.data.userId }
    // Search and filters only narrow that: they are ANDed with the access rule, never replace it.
    const query = allOf(scope, taskSearchFilter({ q, assigneeId, createdBy, due, today }), exact)
    const tasks = await Task.find({ projectId: id, ...query })
      .populate('assignedTo', 'name email profilePicture')
      .populate('createdBy', 'name email')
      .sort({ order: 1 })

    // Dependencies are shown beside the status, never instead of it: two extra queries for the whole list.
    return NextResponse.json({ tasks: await withBlockerCounts(tasks) }, { status: 200 })
  } catch (error) {
    console.error('Get tasks error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Create a task. Restricted to the project's admin owner or team_leader —
 * planning and assigning work is their job; a developer only ever works
 * the tasks already put in front of them (see PUT .../status).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { editorOnly: true })
    if (auth.response) return auth.response

    const { userId, project } = auth.data
    const body = await parseBody(request, createTaskSchema)
    if (body.response) return body.response

    if (body.data.assignedTo && !(await isValidAssignee(project, body.data.assignedTo))) {
      return NextResponse.json({ error: ASSIGNEE_ERROR }, { status: 400 })
    }

    const taskCount = await Task.countDocuments({ projectId: id })

    const task = await Task.create({
      ...body.data,
      projectId: id,
      createdBy: userId,
      status: 'todo',
      priority: body.data.priority || 'medium',
      actualHours: 0,
      order: taskCount,
    })

    // A new task changes the completed/total ratio.
    await syncProjectProgress(id)

    await recordActivity({
      projectId: id,
      actorId: userId,
      type: 'TASK_CREATED',
      taskId: task._id,
      metadata: task.assignedTo ? { assigneeId: task.assignedTo } : undefined,
    })

    if (task.assignedTo) {
      await emitNotification({
        userId: task.assignedTo,
        actorId: userId,
        type: 'task-assigned',
        message: `${await actorName(userId)} assigned you "${task.title}" in ${project.title}`,
        taskId: task._id,
        projectId: project._id,
      })
    }

    await task.populate('assignedTo', 'name email profilePicture')
    await task.populate('createdBy', 'name email')

    return NextResponse.json({ message: 'Task created', task }, { status: 201 })
  } catch (error) {
    console.error('Create task error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
