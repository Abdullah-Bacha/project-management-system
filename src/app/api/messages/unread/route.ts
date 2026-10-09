import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/db/mongodb'
import { Message } from '@/lib/db/models'
import { authenticateRequest } from '@/lib/auth/middleware'

/** Unread direct messages per sender: `{ counts: { [senderId]: n } }`. */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    await connectToDatabase()

    const rows = await Message.aggregate([
      {
        $match: {
          recipient: new mongoose.Types.ObjectId(user.userId),
          readAt: { $exists: false },
        },
      },
      { $group: { _id: '$sender', n: { $sum: 1 } } },
    ])

    const counts: Record<string, number> = {}
    for (const r of rows) counts[String(r._id)] = r.n
    return NextResponse.json({ counts }, { status: 200 })
  } catch (error) {
    console.error('Unread messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
