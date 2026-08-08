import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/db/mongodb'
import { Notification } from '@/lib/db/models'
import { authenticateRequest } from '@/lib/auth/middleware'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    await connectToDatabase()

    const deleted = await Notification.findOneAndDelete({
      _id: id,
      userId: user.userId,
    })

    if (!deleted) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Notification deleted' }, { status: 200 })
  } catch (error) {
    console.error('Delete notification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
