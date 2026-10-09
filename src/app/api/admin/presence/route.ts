import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { getPresence } from '@/lib/services/presence'

/** GET /api/admin/presence — who is online right now, and when everyone else was last seen. Administrators only. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    await connectToDatabase()
    const report = await getPresence()
    // Always fresh: a cached "online" would be wrong within seconds.
    return NextResponse.json(report, { status: 200, headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Admin presence error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
