import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/middleware'
import { redactForDemo } from '@/lib/auth/demo'
import { connectToDatabase } from '@/lib/db/mongodb'
import { searchWorkspace } from '@/lib/services/search'
import type { SearchResults } from '@/types'

const MIN_QUERY = 2
const MAX_QUERY = 100

const EMPTY: SearchResults = { projects: [], tasks: [], people: [] }

/**
 * Navbar search: GET /api/search?q=…
 * Returns a few projects, tasks and people matching the term, limited to what
 * the caller is allowed to see (see lib/services/search.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY)
    if (q.length < MIN_QUERY) return NextResponse.json(EMPTY, { status: 200 })

    await connectToDatabase()
    const results = await searchWorkspace(user, q)

    // The shared demo account sees other people's emails masked, as everywhere else.
    return NextResponse.json(redactForDemo(user.email, results), { status: 200 })
  } catch (error) {
    console.error('Search error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
