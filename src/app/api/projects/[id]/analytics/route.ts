import { NextRequest, NextResponse } from 'next/server'
import { Task } from '@/lib/db/models'
import { authorizeProject } from '@/lib/auth/authorize'
import { isValidDateOnly } from '@/lib/due-date'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // The viewer's calendar date (Feature #10), so "overdue" agrees with every other
    // screen. Without it, the server's UTC date is used, as before.
    const todayParam = request.nextUrl.searchParams.get('today')
    if (todayParam !== null && !isValidDateOnly(todayParam)) {
      return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })
    }
    const auth = await authorizeProject(request, id)
    if (auth.response) return auth.response

    // Only the fields the metrics read, as plain objects (no full documents).
    const tasks = await Task.find({ projectId: id })
      .select('status priority dueDate estimatedHours actualHours')
      .lean()

    const tasksByStatus = {
      todo: tasks.filter((t) => t.status === 'todo').length,
      'in-progress': tasks.filter((t) => t.status === 'in-progress').length,
      review: tasks.filter((t) => t.status === 'review').length,
      complete: tasks.filter((t) => t.status === 'complete').length,
    }

    const totalTasks = tasks.length
    const completedTasks = tasksByStatus.complete
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

    // Overdue is a due DAY before today, not a time of day.
    const today = todayParam ?? new Date().toISOString().slice(0, 10)
    const overdueTasks = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate).toISOString().slice(0, 10) < today && t.status !== 'complete'
    ).length

    const highPriorityTasks = tasks.filter(
      (t) => t.priority === 'high' || t.priority === 'urgent'
    ).length

    const totalEstimatedHours = tasks.reduce(
      (sum, t) => sum + (t.estimatedHours || 0),
      0
    )
    const totalActualHours = tasks.reduce((sum, t) => sum + (t.actualHours || 0), 0)

    return NextResponse.json(
      {
        tasksByStatus,
        completionRate: Math.round(completionRate),
        totalTasks,
        completedTasks,
        overdueTasks,
        highPriorityTasks,
        totalEstimatedHours,
        totalActualHours,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get analytics error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
