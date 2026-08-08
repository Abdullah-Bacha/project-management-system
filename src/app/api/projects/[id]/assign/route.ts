import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { Project, Team } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { emitNotification } from '@/lib/notifications/emit'
import { z } from 'zod'

// null explicitly clears the team; undefined/absent leaves it untouched.
const assignSchema = z.object({
  teamId: z.string().refine(mongoose.isValidObjectId).nullable().optional(),
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
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const body = await request.json()
    const validation = assignSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    }
    if (!('teamId' in validation.data)) {
      return NextResponse.json({ error: 'teamId is required' }, { status: 400 })
    }

    const project = await Project.findById(id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { teamId } = validation.data
    const members = new Set<string>(project.members.map((m: any) => m.toString()))
    members.add(project.owner.toString())

    if (project.team) {
      const oldTeam = await Team.findById(project.team)
      if (oldTeam) {
        members.delete(oldTeam.teamLeader.toString())
        oldTeam.members.forEach((m: any) => members.delete(m.toString()))
      }
    }

    let notifyTeam: any = null

    if (teamId) {
      const team = await Team.findById(teamId)
      if (!team) {
        return NextResponse.json({ error: 'Team not found' }, { status: 404 })
      }
      project.team = new mongoose.Types.ObjectId(teamId)
      members.add(team.teamLeader.toString())
      team.members.forEach((m: any) => members.add(m.toString()))
      notifyTeam = team
    } else {
      project.team = undefined
    }

    project.members = [...members]
    await project.save()

    if (notifyTeam) {
      const recipients = new Set<string>([
        notifyTeam.teamLeader.toString(),
        ...notifyTeam.members.map((m: any) => m.toString()),
      ])
      await Promise.all(
        [...recipients].map((userId) =>
          emitNotification({
            userId,
            actorId: auth.data.userId,
            type: 'project-assigned',
            message: `Your team was assigned to "${project.title}"`,
            projectId: project._id,
          })
        )
      )
    }

    await project.populate('owner', 'name email profilePicture role')
    await project.populate('members', 'name email profilePicture role')
    await project.populate({
      path: 'team',
      populate: [
        { path: 'teamLeader', select: 'name email role' },
        { path: 'members', select: 'name email role' },
      ],
    })

    return NextResponse.json({ message: 'Team assignment updated', project }, { status: 200 })
  } catch (error) {
    console.error('Assign project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
