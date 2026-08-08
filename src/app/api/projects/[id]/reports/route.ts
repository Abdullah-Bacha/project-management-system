import { NextRequest, NextResponse } from 'next/server'
import { Report, Task, User } from '@/lib/db/models'
import { authorizeProject } from '@/lib/auth/authorize'
import { emitNotification } from '@/lib/notifications/emit'
import { z } from 'zod'

const submitReportSchema = z.object({
  note: z.string().max(2000).optional(),
})

/**
 * Submit a daily progress report — the team_leader's "here's where we are"
 * to admin. Restricted the same way project editing is (admin owner or the
 * team_leader running this project): a developer works tasks and leaves
 * comments, but rolling that up into a report to admin is the leader's job.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { editorOnly: true })
    if (auth.response) return auth.response

    const { userId, project } = auth.data

    if (!project.team) {
      return NextResponse.json(
        { error: 'This project has no team staffed — nothing to report yet.' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const validation = submitReportSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    }

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const [allTasks, completedToday] = await Promise.all([
      Task.find({ projectId: id }).select('status'),
      Task.find({
        projectId: id,
        status: 'complete',
        updatedAt: { $gte: startOfToday },
      }).select('title'),
    ])

    const totalTasks = allTasks.length
    const completedTasks = allTasks.filter((t) => t.status === 'complete').length
    const completionRate =
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    const report = await Report.create({
      project: id,
      team: project.team,
      submittedBy: userId,
      note: validation.data.note ?? '',
      completedToday: completedToday.map((t) => ({ task: t._id, title: t.title })),
      totalTasks,
      completedTasks,
      completionRate,
    })

    // Every admin should see this, not just the project's owner — admin
    // oversight is system-wide in this model.
    const admins = await User.find({ role: 'admin' }).select('_id')
    await Promise.all(
      admins.map((admin) =>
        emitNotification({
          userId: admin._id,
          actorId: userId,
          type: 'report-submitted',
          message: `${completedToday.length} task(s) completed today on "${project.title}" — ${completionRate}% overall`,
          projectId: project._id,
        })
      )
    )

    await report.populate('submittedBy', 'name email')
    await report.populate('project', 'title')

    return NextResponse.json({ message: 'Report sent', report }, { status: 201 })
  } catch (error) {
    console.error('Submit report error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** List reports for a project — any member can see the project's own report history. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id)
    if (auth.response) return auth.response

    const reports = await Report.find({ project: id })
      .populate('submittedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(50)

    return NextResponse.json({ reports }, { status: 200 })
  } catch (error) {
    console.error('List reports error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
