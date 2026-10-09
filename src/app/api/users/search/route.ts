import { NextRequest, NextResponse } from 'next/server'
import { User } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { redactForDemo } from '@/lib/auth/demo'

/** Escape user input before embedding it in a RegExp. */
function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Find people to add to a project.
 *
 * Admin-only: adding members is an owner (admin) action, so other roles have
 * no use for a directory lookup and must not be able to enumerate accounts.
 * Requires a search term, returns a short list, and skips suspended accounts.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 100)

    if (q.length < 2) {
      return NextResponse.json({ users: [] }, { status: 200 })
    }

    const pattern = new RegExp(escapeRegex(q), 'i')
    const users = await User.find({
      _id: { $ne: auth.data.userId },
      status: { $ne: 'suspended' },
      $or: [{ name: pattern }, { email: pattern }],
    })
      .select('name email profilePicture')
      .limit(10)

    return NextResponse.json(redactForDemo(auth.data.email, { users }), { status: 200 })
  } catch (error) {
    console.error('User search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
