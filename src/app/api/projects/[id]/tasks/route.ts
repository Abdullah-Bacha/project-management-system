import { NextRequest, NextResponse } from 'next/server'
import { Task } from '@/lib/db/models'
import { authorizeProject } from '@/lib/auth/authorize'
import { emitNotification } from '@/lib/notifications/emit'
import { z } from 'zod'

const createTaskSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.number().optional(),
  tags: z.array(z.string()).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id)
    if (auth.response) return auth.response

    const status = request.nextUrl.searchParams.get('status')
    const priority = request.nextUrl.searchParams.get('priority')

    const query: any = { projectId: id }
    if (status) query.status = status
    if (priority) query.priority = priority

    const tasks = await Task.find(query)
      .populate('assignedTo', 'name email profilePicture')
      .populate('createdBy', 'name email')
      .sort({ order: 1 })

    return NextResponse.json({ tasks }, { status: 200 })
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
    const body = await request.json()
    const validation = createTaskSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.issues },
        { status: 400 }
      )
    }

    const taskCount = await Task.countDocuments({ projectId: id })

    const task = await Task.create({
      ...validation.data,
      projectId: id,
      createdBy: userId,
      status: 'todo',
      priority: validation.data.priority || 'medium',
      actualHours: 0,
      order: taskCount,
    })

    if (task.assignedTo) {
      await emitNotification({
        userId: task.assignedTo,
        actorId: userId,
        type: 'task-assigned',
        message: `You were assigned "${task.title}" in ${project.title}`,
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
