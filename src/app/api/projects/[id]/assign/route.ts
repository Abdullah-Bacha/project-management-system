import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { Project, Team } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { PROJECT_POPULATE, assignTeamToProject } from '@/lib/services/projects'
import { parseBody, objectIdString } from '@/lib/validation'
import { z } from 'zod'

// null explicitly clears the team; undefined/absent is rejected below.
const assignSchema = z.object({
  teamId: objectIdString.nullable().optional(),
})

/**
 * (Re)assign the team staffed on a project — the only staffing decision
 * left now that the team_leader doubles as the project's manager.
 *
 * Global-admin gated rather than project-owner gated: this is how staffing
 * decisions get made in the first place, so it can't depend on already
 * being on the project.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAdmin(request, { blockDemo: true })
    if (auth.response) return auth.response

    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const body = await parseBody(request, assignSchema)
    if (body.response) return body.response
    if (!('teamId' in body.data)) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const project = await Project.findById(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { teamId } = body.data
    const team = teamId ? await Team.findById(teamId) : null
    if (teamId && !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    await assignTeamToProject(project, team, auth.data.userId)
    await project.populate(PROJECT_POPULATE)

    return NextResponse.json({ message: 'Team assignment updated', project }, { status: 200 })
  } catch (error) {
    console.error('Assign project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
