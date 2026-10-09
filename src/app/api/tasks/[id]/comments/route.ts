import { NextRequest, NextResponse } from 'next/server'
import { Comment } from '@/lib/db/models'
import { authorizeTask } from '@/lib/auth/authorize'
import { emitNotification } from '@/lib/services/notifications'
import { recordActivity } from '@/lib/services/activity'
import { z } from 'zod'
import { parseBody } from '@/lib/validation'
import { parsePagination } from '@/lib/validation/query'

const createCommentSchema = z.object({
  text: z.string().min(1).max(5000),
  attachments: z.array(z.string()).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Same rule as GET /api/tasks/:id: a developer reaches only their own task; leaders and owners any task in their project.
    const auth = await authorizeTask(request, id, { assigneeOrEditor: true })
    if (auth.response) return auth.response

    const { skip, limit } = parsePagination(request.nextUrl.searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    })

    const [comments, total] = await Promise.all([
      Comment.find({ taskId: id })
        .populate('userId', 'name email profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Comment.countDocuments({ taskId: id }),
    ])

    return NextResponse.json({ comments, total }, { status: 200 })
  } catch (error) {
    console.error('Get comments error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeTask(request, id, { assigneeOrEditor: true })
    if (auth.response) return auth.response

    const { userId, task, project } = auth.data
    const validation = await parseBody(request, createCommentSchema)
    if (validation.response) return validation.response

    const comment = await Comment.create({
      ...validation.data,
      taskId: id,
      userId,
      likes: [],
    })

    await recordActivity({
      projectId: project._id,
      actorId: userId,
      type: 'COMMENT_ADDED',
      taskId: task._id,
      commentId: comment._id,
    })

    // Only the people on the task hear about a comment: its assignee and its creator.
    const people = new Set([task.assignedTo, task.createdBy].filter(Boolean).map(String))
    people.delete(String(userId))
    for (const person of people) {
      await emitNotification({
        userId: person,
        actorId: userId,
        type: 'comment-added',
        message: `New comment on "${task.title}"`,
        taskId: task._id,
        projectId: project._id,
      })
    }

    await comment.populate('userId', 'name email profilePicture')

    return NextResponse.json({ message: 'Comment created', comment }, { status: 201 })
  } catch (error) {
    console.error('Create comment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
