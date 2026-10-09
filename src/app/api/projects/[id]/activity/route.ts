import { NextRequest, NextResponse } from 'next/server'
import { authorizeProject } from '@/lib/auth/authorize'
import { ACTIVITY_PAGE_SIZE, listActivity } from '@/lib/services/activity'
import { parsePagination } from '@/lib/validation/query'

/**
 * A project's activity feed, newest first. Read-only: entries are written
 * only by the server-side actions that cause them, so there is deliberately
 * no POST here. Visible to the project's members (404 for everyone else).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { withEditor: true })
    if (auth.response) return auth.response

    const { skip, limit } = parsePagination(request.nextUrl.searchParams, {
      defaultLimit: ACTIVITY_PAGE_SIZE,
      maxLimit: 100,
    })

    const page = await listActivity({
      projectId: id,
      viewerId: auth.data.userId,
      isEditor: Boolean(auth.data.isEditor),
      skip,
      limit,
    })

    return NextResponse.json(page, { status: 200 })
  } catch (error) {
    console.error('Get activity error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
