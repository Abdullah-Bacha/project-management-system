import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { Team, User } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { z } from 'zod'

const createTeamSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  teamLeaderId: z.string().refine(mongoose.isValidObjectId, 'Invalid team leader id'),
  memberIds: z
    .array(z.string().refine(mongoose.isValidObjectId))
    .max(50)
    .default([]),
})

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const teams = await Team.find()
      .populate('teamLeader', 'name email role')
      .populate('members', 'name email role')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })

    return NextResponse.json({ teams }, { status: 200 })
  } catch (error) {
    console.error('List teams error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const body = await request.json()
    const validation = createTeamSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.issues },
        { status: 400 }
      )
    }

    const { name, description, teamLeaderId, memberIds } = validation.data

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
