import { NextRequest, NextResponse } from 'next/server'
import { Task } from '@/lib/db/models'
import { authorizeProject } from '@/lib/auth/authorize'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id)
    if (auth.response) return auth.response

    const tasks = await Task.find({ projectId: id })

    const tasksByStatus = {
      todo: tasks.filter((t) => t.status === 'todo').length,
      'in-progress': tasks.filter((t) => t.status === 'in-progress').length,
      review: tasks.filter((t) => t.status === 'review').length,
      complete: tasks.filter((t) => t.status === 'complete').length,
    }

    const totalTasks = tasks.length
    const completedTasks = tasksByStatus.complete
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

    const now = Date.now()
    const overdueTasks = tasks.filter(
      (t) => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'complete'
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
