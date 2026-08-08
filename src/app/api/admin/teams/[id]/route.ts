import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { Team, User, Project } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { z } from 'zod'

const updateTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  teamLeaderId: z.string().refine(mongoose.isValidObjectId).optional(),
  memberIds: z.array(z.string().refine(mongoose.isValidObjectId)).max(50).optional(),
})

export async function GET(
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

    const team = await Team.findById(id)
      .populate('teamLeader', 'name email role')
      .populate('members', 'name email role')

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    return NextResponse.json({ team }, { status: 200 })
  } catch (error) {
    console.error('Get team error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
    const validation = updateTeamSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 })
    }

    const team = await Team.findById(id)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    // Snapshot the roster before mutating `team` below — needed to tell,
    // per staffed project, which members came from this team versus were
    // added by hand and should survive the reassignment.
    const previousRoster = new Set<string>([
      team.teamLeader.toString(),
      ...team.members.map((m: any) => m.toString()),
    ])

    const { teamLeaderId, memberIds, ...rest } = validation.data

    if (teamLeaderId) {
      const leader = await User.findById(teamLeaderId).select('role')
      if (!leader || leader.role !== 'team_leader') {
        return NextResponse.json(
          { error: 'The selected user is not a team leader' },
          { status: 400 }
        )
      }
      team.teamLeader = new mongoose.Types.ObjectId(teamLeaderId)
    }

    if (memberIds) {
      const leaderId = (teamLeaderId ?? team.teamLeader.toString()).toString()
      const uniqueMemberIds = [...new Set(memberIds)].filter((m) => m !== leaderId)

      if (uniqueMemberIds.length) {
        const foundCount = await User.countDocuments({ _id: { $in: uniqueMemberIds } })
        if (foundCount !== uniqueMemberIds.length) {
          return NextResponse.json(
            { error: 'One or more selected members do not exist' },
            { status: 400 }
          )
        }
      }
      team.members = uniqueMemberIds.map((m) => new mongoose.Types.ObjectId(m))
    }

    Object.assign(team, rest)
    await team.save()
    await team.populate('teamLeader', 'name email role')
    await team.populate('members', 'name email role')

    // Any project staffed with this team should reflect the new roster —
    // otherwise a swapped-out developer keeps write access to tasks they
    // were removed from.
    const staffedProjects = await Project.find({ team: id })
    for (const project of staffedProjects) {
      const owner = project.owner.toString()

      // Anyone currently on the project who wasn't part of the team's old
      // roster was added by hand (via the members page) — keep them.
      const adHocExtras = project.members
        .map((m: any) => m.toString())
        .filter((m: string) => !previousRoster.has(m))

      const next = new Set<string>([owner, ...adHocExtras])
      next.add(team.teamLeader.toString())
      team.members.forEach((m: any) => next.add(m.toString()))

      project.members = [...next]
      await project.save()
    }

    return NextResponse.json({ message: 'Team updated', team }, { status: 200 })
  } catch (error) {
    console.error('Update team error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    const inUse = await Project.countDocuments({ team: id })
    if (inUse > 0) {
      return NextResponse.json(
        {
          error: `This team is assigned to ${inUse} project(s). Reassign them before deleting.`,
        },
        { status: 400 }
      )
    }

    const deleted = await Team.findByIdAndDelete(id)
    if (!deleted) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    return NextResponse.json({ message: 'Team deleted' }, { status: 200 })
  } catch (error) {
    console.error('Delete team error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
