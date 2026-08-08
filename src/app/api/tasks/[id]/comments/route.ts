import { NextRequest, NextResponse } from 'next/server'
import { Comment } from '@/lib/db/models'
import { authorizeTask } from '@/lib/auth/authorize'
import { emitToProject } from '@/lib/notifications/emit'
import { z } from 'zod'

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
    const auth = await authorizeTask(request, id)
    if (auth.response) return auth.response

    const skip = parseInt(request.nextUrl.searchParams.get('skip') || '0')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '20')

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
    const auth = await authorizeTask(request, id)
    if (auth.response) return auth.response

    const { userId, task, project } = auth.data
    const body = await request.json()
    const validation = createCommentSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    }

    const comment = await Comment.create({
      ...validation.data,
      taskId: id,
      userId,
      likes: [],
    })

    await emitToProject(project, {
      actorId: userId,
      type: 'comment-added',
      message: `New comment on "${task.title}"`,
      taskId: task._id,
    })

    await comment.populate('userId', 'name email profilePicture')

    return NextResponse.json({ message: 'Comment created', comment }, { status: 201 })
  } catch (error) {
    console.error('Create comment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
