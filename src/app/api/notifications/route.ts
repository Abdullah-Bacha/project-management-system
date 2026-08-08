import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { Notification } from '@/lib/db/models'
import { authenticateRequest } from '@/lib/auth/middleware'

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    const skip = parseInt(request.nextUrl.searchParams.get('skip') || '0')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10')
    const read = request.nextUrl.searchParams.get('read')

    const query: any = { userId: user.userId }
    if (read === 'false') query.read = false

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .populate('taskId', 'title')
        .populate('projectId', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId: user.userId, read: false }),
    ])

    return NextResponse.json({ notifications, total, unreadCount }, { status: 200 })
  } catch (error) {
    console.error('Get notifications error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Mark every unread notification for the caller as read. */
export async function PUT(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    const result = await Notification.updateMany(
      { userId: user.userId, read: false },
      { read: true }
    )

    return NextResponse.json(
      { message: 'All notifications marked as read', updated: result.modifiedCount },
      { status: 200 }
    )
  } catch (error) {
    console.error('Mark all read error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
