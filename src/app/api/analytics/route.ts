import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { authenticateRequest } from '@/lib/auth/middleware'
import { isValidTimeZone } from '@/lib/analytics'
import { isValidDateOnly } from '@/lib/due-date'
import { getAnalytics } from '@/lib/services/analytics'
import { objectIdString } from '@/lib/validation'
import { parseFilters } from '@/lib/validation/query'

const dateOnly = z.string().refine(isValidDateOnly, 'Invalid date')

/**
 * GET /api/analytics?teamId=&projectId=&from=&to=&today=&timeZone=
 * Reports & analytics for administrators and team leaders. Developers get 403
 * (they have no team-wide view). A leader only ever sees the teams and
 * projects they manage; anything else is a 404. Every parameter is validated
 * as a plain string (ids as 24-hex, dates as real calendar days), so nothing
 * a caller sends can become a query operator.
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
      from: dateOnly.optional(),
      to: dateOnly.optional(),
      today: dateOnly.optional(),
      timeZone: z.string().refine(isValidTimeZone, 'Invalid time zone').optional(),
    })
    if (filters.response) return filters.response

    const result = await getAnalytics({ userId: user.userId, isAdmin: user.role === 'admin', ...filters.data })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json(result.report, { status: 200 })
  } catch (error) {
    console.error('Analytics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
