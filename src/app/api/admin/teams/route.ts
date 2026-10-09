import { NextRequest, NextResponse } from 'next/server'
import { Project, Team, User } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { redactForDemo } from '@/lib/auth/demo'
import { parseBody, objectIdString } from '@/lib/validation'
import { z } from 'zod'

const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  teamLeaderId: objectIdString,
  memberIds: z.array(objectIdString).max(50).default([]),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const found = await Team.find()
      .populate('teamLeader', 'name email role phone profilePicture')
      .populate('members', 'name email role phone profilePicture')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })

    // What each team is staffed on, for the team's details: one query for all teams.
    const projects = await Project.find({ team: { $in: found.map((t) => t._id) } }).select('title status team')
    const teams = found.map((team) => ({
      ...team.toObject(),
      projects: projects
        .filter((p) => p.team?.toString() === team._id.toString())
        .map((p) => ({ _id: p._id, title: p.title, status: p.status })),
    }))

    return NextResponse.json(redactForDemo(auth.data.email, { teams }), { status: 200 })
  } catch (error) {
    console.error('List teams error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request, { blockDemo: true })
    if (auth.response) return auth.response

    const body = await parseBody(request, createTeamSchema)
    if (body.response) return body.response

    const { name, description, teamLeaderId, memberIds } = body.data

    const leader = await User.findById(teamLeaderId).select('role')
    if (!leader) {
      return NextResponse.json({ error: 'Team leader not found' }, { status: 404 })
    }
    if (leader.role !== 'team_leader') {
      return NextResponse.json(
        { error: 'The selected user is not a team leader' },
        { status: 400 }
      )
    }

    const uniqueMemberIds = [...new Set(memberIds)].filter((m) => m !== teamLeaderId)

    if (uniqueMemberIds.length) {
      const foundCount = await User.countDocuments({ _id: { $in: uniqueMemberIds } })
      if (foundCount !== uniqueMemberIds.length) {
        return NextResponse.json(
          { error: 'One or more selected members do not exist' },
          { status: 400 }
        )
      }
    }

    const team = await Team.create({
      name,
      description,
      teamLeader: teamLeaderId,
      members: uniqueMemberIds,
      createdBy: auth.data.userId,
    })

    await team.populate('teamLeader', 'name email role')
    await team.populate('members', 'name email role')

    return NextResponse.json({ message: 'Team created', team }, { status: 201 })
  } catch (error) {
    console.error('Create team error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
