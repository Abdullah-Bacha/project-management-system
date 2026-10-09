import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { authenticateRequest } from '@/lib/auth/middleware'
import { getPeerPresence } from '@/lib/services/presence'
import { shareTeam } from '@/lib/services/teammates'
import { objectIdString } from '@/lib/validation'

/**
 * GET /api/presence/user/:userId — whether a teammate is online, and when they were last seen
 * (shown on the chat screen). Only people on a team together may see each other's status; anyone
 * else gets 404, so ids cannot be probed. Administrators see everyone through /api/admin/presence.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId } = await params
    if (!objectIdString.safeParse(userId).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    await connectToDatabase()
    if (userId === user.userId || !(await shareTeam(user.userId, userId))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(await getPeerPresence(userId), { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Peer presence error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
