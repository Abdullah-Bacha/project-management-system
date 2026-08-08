import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { User } from '@/lib/db/models'
import { authenticateRequest } from '@/lib/auth/middleware'

/** Escape user input before embedding it in a RegExp. */
function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Look up users to invite to a project.
 *
 * Requires a search term and returns a short list — this is an invite
 * picker, not a directory dump, so it must not enumerate every account.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const q = (request.nextUrl.searchParams.get('q') || '').trim()

    if (q.length < 2) {
      return NextResponse.json({ users: [] }, { status: 200 })
    }

    await connectToDatabase()

    const pattern = new RegExp(escapeRegex(q), 'i')
    const users = await User.find({
      _id: { $ne: user.userId },
      $or: [{ name: pattern }, { email: pattern }],
    })
      .select('name email profilePicture')
      .limit(10)

    return NextResponse.json({ users }, { status: 200 })
  } catch (error) {
    console.error('User search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
