import { NextRequest, NextResponse } from 'next/server'
import { Project, Task, Comment, Notification } from '@/lib/db/models'
import { authorizeProject } from '@/lib/auth/authorize'
import { z } from 'zod'

const updateProjectSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional(),
  requirements: z.string().max(5000).optional(),
  status: z.enum(['active', 'archived', 'completed']).optional(),
  color: z.string().optional(),
  deadline: z.string().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, {
      populate: ['owner', 'members'],
    })
    if (auth.response) return auth.response

    await auth.data.project.populate({
      path: 'team',
      populate: [
        { path: 'teamLeader', select: 'name email role' },
        { path: 'members', select: 'name email role' },
      ],
    })

    return NextResponse.json({ project: auth.data.project }, { status: 200 })
  } catch (error) {
    console.error('Get project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Edit the project's content — title, description, requirements, status,
 * deadline. Open to the owning admin or the team_leader of the team
 * currently staffed on it (see authorizeProject's `editorOnly`), since a
 * team_leader runs their project's day-to-day content. Staffing itself
 * (who the team/leader is) only changes through /assign, and deletion stays
 * admin-only below.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { editorOnly: true })
    if (auth.response) return auth.response

    const body = await request.json()
    const validation = updateProjectSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.issues },
        { status: 400 }
      )
    }

    const project = await Project.findByIdAndUpdate(id, validation.data, {
      new: true,
    })
      .populate('owner', 'name email profilePicture role')
      .populate('members', 'name email profilePicture role')
      .populate({
        path: 'team',
        populate: [
          { path: 'teamLeader', select: 'name email role' },
          { path: 'members', select: 'name email role' },
        ],
      })

    return NextResponse.json({ message: 'Project updated', project }, { status: 200 })
  } catch (error) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { ownerOnly: true })
    if (auth.response) return auth.response

    // Cascade: without this the project's tasks, their comments and any
    // related notifications would be orphaned in the database.
    const tasks = await Task.find({ projectId: id }).select('_id')
    const taskIds = tasks.map((t) => t._id)

    await Promise.all([
      Comment.deleteMany({ taskId: { $in: taskIds } }),
      Task.deleteMany({ projectId: id }),
      Notification.deleteMany({ projectId: id }),
    ])
    await Project.findByIdAndDelete(id)

    return NextResponse.json(
      { message: 'Project deleted successfully', deletedTasks: taskIds.length },
      { status: 200 }
    )
  } catch (error) {
    console.error('Delete project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
