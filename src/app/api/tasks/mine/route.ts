import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth/middleware'
import { connectToDatabase } from '@/lib/db/mongodb'
import { listMyTasks } from '@/lib/services/tasks'
import { parseFilters, parsePagination } from '@/lib/validation/query'
import { objectIdString } from '@/lib/validation'
import { taskSearchShape } from '@/lib/services/task-search'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/types'
import { z } from 'zod'

/**
 * GET /api/tasks/mine — the signed-in user's own open tasks (dashboard widget);
 * with ?include=all also the finished ones (My Tasks page). Only ever returns tasks assigned to the caller, in
 * projects the caller belongs to.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { limit } = parsePagination(request.nextUrl.searchParams, { defaultLimit: 10, maxLimit: 50 })

    // Optional search and filters (?q=&status=&projectId=), applied to the caller's own tasks.
    const filters = parseFilters(request.nextUrl.searchParams, {
      q: taskSearchShape.q,
      status: z.enum(TASK_STATUSES).optional(),
      priority: z.enum(TASK_PRIORITIES).optional(),
      due: taskSearchShape.due,
      today: taskSearchShape.today,
      projectId: objectIdString.optional(),
    })
    if (filters.response) return filters.response

    await connectToDatabase()
    return NextResponse.json(
      await listMyTasks(user.userId, limit, request.nextUrl.searchParams.get('include') === 'all', filters.data),
      { status: 200 }
    )
  } catch (error) {
    console.error('My tasks error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
