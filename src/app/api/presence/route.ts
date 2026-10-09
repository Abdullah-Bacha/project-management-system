import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { connectToDatabase } from '@/lib/db/mongodb'
import { authenticateRequest } from '@/lib/auth/middleware'
import { TAB_ID_PATTERN } from '@/lib/presence'
import { recordBeat } from '@/lib/services/presence'
import { parseBody } from '@/lib/validation'

const beatSchema = z.object({ tabId: z.string().regex(TAB_ID_PATTERN, 'Invalid tab id') })

/**
 * POST /api/presence — a signed-in tab says "still here". The person is the one
 * the verified token names; a body can only name the caller's own tab, so nobody
 * can report someone else as online.
 */
export async function POST(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await parseBody(request, beatSchema)
    if (body.response) return body.response

    await connectToDatabase()
    const result = await recordBeat({ userId: user.userId, tabId: body.data.tabId })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('Presence beat error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
