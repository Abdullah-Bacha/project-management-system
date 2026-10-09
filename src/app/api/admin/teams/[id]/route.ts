import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { Team, User, Project } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { redactForDemo } from '@/lib/auth/demo'
import { teamRoster, syncStaffedProjects } from '@/lib/services/projects'
import { parseBody, objectIdString } from '@/lib/validation'
import { z } from 'zod'

const updateTeamSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  teamLeaderId: objectIdString.optional(),
  memberIds: z.array(objectIdString).max(50).optional(),
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

    return NextResponse.json(redactForDemo(auth.data.email, { team }), { status: 200 })
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
    const auth = await authorizeAdmin(request, { blockDemo: true })
    if (auth.response) return auth.response

    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const body = await parseBody(request, updateTeamSchema)
    if (body.response) return body.response

    const team = await Team.findById(id)
    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    // Snapshot the roster before changing it: staffed projects need it to
    // tell team-derived members apart from ones added by hand.
    const previousRoster = new Set(teamRoster(team))

    const { teamLeaderId, memberIds, ...rest } = body.data

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

    // Any project staffed with this team must reflect the new roster, or a
    // swapped-out developer keeps access to tasks they were removed from.
    await syncStaffedProjects(team, previousRoster)

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
    const auth = await authorizeAdmin(request, { blockDemo: true })
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
