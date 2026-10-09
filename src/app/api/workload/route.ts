import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/auth/middleware'
import { isValidDateOnly } from '@/lib/due-date'
import { getWorkload } from '@/lib/services/workload'
import { objectIdString } from '@/lib/validation'
import { parseFilters } from '@/lib/validation/query'
import { WORKLOAD_STATUSES } from '@/lib/workload'

/**
 * GET /api/workload?teamId=&projectId=&workload=&today=
 * Team workload for administrators and team leaders. Developers get 403:
 * they have no team-wide view. A leader only ever sees the teams and
 * projects they manage; anything else is a 404.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (!user) return NextResponse.json({ error }, { status: 401 })
    if (user.role !== 'admin' && user.role !== 'team_leader') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const filters = parseFilters(request.nextUrl.searchParams, {
      teamId: objectIdString.optional(),
      projectId: objectIdString.optional(),
      workload: z.enum(WORKLOAD_STATUSES).optional(),
      today: z.string().refine(isValidDateOnly, 'Invalid date').optional(),
    })
    if (filters.response) return filters.response

    const result = await getWorkload({ userId: user.userId, isAdmin: user.role === 'admin', ...filters.data })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json(result.report, { status: 200 })
  } catch (error) {
    console.error('Workload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
