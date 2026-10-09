import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { Message, Notification, Team } from '@/lib/db/models'
import { actorName, emitNotification } from '@/lib/services/notifications'
import { authenticateRequest } from '@/lib/auth/middleware'
import { parseBody, objectIdString } from '@/lib/validation'
import { z } from 'zod'

const sendSchema = z.object({ text: z.string().trim().min(1).max(2000) })

/** Two people may chat only when they are on a team together (as leader or member). */
async function shareTeam(a: string, b: string) {
  const team = await Team.exists({
    $or: [
      { teamLeader: a, members: b },
      { teamLeader: b, members: a },
      { members: { $all: [a, b] } },
    ],
  })
  return Boolean(team)
}

async function guard(request: NextRequest, params: Promise<{ userId: string }>) {
  const { user, error } = await authenticateRequest(request)
  if (error || !user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const { userId } = await params
  if (!objectIdString.safeParse(userId).success || userId === user.userId) {
    return { response: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }
  }
  await connectToDatabase()
  // Not a teammate → 404, so ids can't be probed.
  if (!(await shareTeam(user.userId, userId))) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { me: user.userId, other: userId }
}

/** The conversation with one teammate, oldest first (last 200 messages). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const g = await guard(request, params)
    if (g.response) return g.response

    const messages = await Message.find({
      $or: [
        { sender: g.me, recipient: g.other },
        { sender: g.other, recipient: g.me },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()

    await Message.updateMany(
      { sender: g.other, recipient: g.me, readAt: { $exists: false } },
      { readAt: new Date() }
    )

    return NextResponse.json({ messages: messages.reverse() }, { status: 200 })
  } catch (error) {
    console.error('Get messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const g = await guard(request, params)
    if (g.response) return g.response

    const body = await parseBody(request, sendSchema)
    if (body.response) return body.response

    const message = await Message.create({
      sender: g.me,
      recipient: g.other,
      text: body.data.text,
    })

    // Tell the recipient. One unread "new message" per sender is enough, so a
    // burst of messages doesn't flood their notifications.
    const name = await actorName(g.me)
    const text = `${name} sent you a message`
    const pending = await Notification.exists({ userId: g.other, type: 'new-message', message: text, read: false })
    if (!pending) {
      await emitNotification({ userId: g.other, actorId: g.me, type: 'new-message', message: text })
    }

    return NextResponse.json({ message }, { status: 201 })
  } catch (error) {
    console.error('Send message error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
