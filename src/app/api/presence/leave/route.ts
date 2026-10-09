import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/db/mongodb'
import { authenticateRequest } from '@/lib/auth/middleware'
import { TAB_ID_PATTERN } from '@/lib/presence'
import { recordLeave } from '@/lib/services/presence'
import { parseBody } from '@/lib/validation'

const leaveSchema = z.object({ tabId: z.string().regex(TAB_ID_PATTERN, 'Invalid tab id') })

/**
 * POST /api/presence/leave — a tab says goodbye (it was closed, or the person
 * signed out). It can only close the caller's own tab. If this never arrives
 * (crash, power loss, network drop) the tab simply expires; see lib/presence.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await parseBody(request, leaveSchema)
    if (body.response) return body.response

    await connectToDatabase()
    await recordLeave({ userId: user.userId, tabId: body.data.tabId })
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('Presence leave error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
