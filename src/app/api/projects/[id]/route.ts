import { NextRequest, NextResponse } from 'next/server'
import { Project } from '@/lib/db/models'
import { authorizeProject, getProjectCapabilities } from '@/lib/auth/authorize'
import { PROJECT_POPULATE, deleteProjectCascade } from '@/lib/services/projects'
import { parseBody } from '@/lib/validation'
import { dateOnly, isValidDateOnly } from '@/lib/due-date'
import { referenceLinksSchema } from '@/lib/validation/project-resources'
import { PROJECT_STATUSES } from '@/types'
import { z } from 'zod'

const updateProjectSchema = z.object({
  title: z.string().min(3).max(100).optional(),
  description: z.string().max(500).optional(),
  requirements: z.string().max(5000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  // null clears the date.
  startDate: z.union([z.string().refine(isValidDateOnly, 'Invalid date'), z.null()]).optional(),
  deadline: z.union([z.string(), z.null()]).optional(),
  // Replaces the whole list (the form sends the list it shows).
  referenceLinks: referenceLinksSchema.optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id)
    if (auth.response) return auth.response

    const { project, userId, role } = auth.data
    await project.populate(PROJECT_POPULATE)

    // `capabilities` tells the UI what this caller may do, so it does not
    // have to re-derive owner / team-leader rules in every component.
    const capabilities = await getProjectCapabilities(project, userId, role)

    return NextResponse.json(
      { project: { ...project.toObject(), capabilities } },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Edit the project's content — title, description, requirements, status,
 * start date, deadline, reference links. Open to the owning admin or the team_leader of the team
 * currently staffed on it (see authorizeProject's `editorOnly`). Staffing
 * itself only changes through /assign, and deletion stays owner-only below.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { editorOnly: true })
    if (auth.response) return auth.response

    const body = await parseBody(request, updateProjectSchema)
    if (body.response) return body.response

    // A deadline before the start (as sent, or against what is already stored) is refused.
    const { startDate, deadline, ...rest } = body.data
    const effective = (sent: string | null | undefined, stored: unknown) => (sent === undefined ? dateOnly(stored as string | Date | undefined) : sent ? dateOnly(sent) : '')
    const start = effective(startDate, auth.data.project.startDate)
    const end = effective(deadline, auth.data.project.deadline)
    if (start && end && end < start) {
      return NextResponse.json({ error: 'Deadline cannot be before the start date' }, { status: 400 })
    }

    const $set: Record<string, unknown> = { ...rest }
    const $unset: Record<string, 1> = {}
    for (const [key, value] of [['startDate', startDate], ['deadline', deadline]] as const) {
      if (value === null) $unset[key] = 1
      else if (value !== undefined) $set[key] = value
    }

    const project = await Project.findByIdAndUpdate(
      id,
      { ...(Object.keys($set).length > 0 && { $set }), ...(Object.keys($unset).length > 0 && { $unset }) },
      { new: true }
    ).populate(PROJECT_POPULATE)

    return NextResponse.json({ message: 'Project updated', project }, { status: 200 })
  } catch (error) {
    console.error('Update project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { ownerOnly: true })
    if (auth.response) return auth.response

    const { deletedTasks } = await deleteProjectCascade(id)

    return NextResponse.json(
      { message: 'Project deleted successfully', deletedTasks },
      { status: 200 }
    )
  } catch (error) {
    console.error('Delete project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
