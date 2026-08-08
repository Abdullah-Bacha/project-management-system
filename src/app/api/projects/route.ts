import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/db/mongodb'
import { Project, Team } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { authenticateRequest } from '@/lib/auth/middleware'
import { emitNotification } from '@/lib/notifications/emit'
import { z } from 'zod'

const createProjectSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  requirements: z.string().max(5000).optional(),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
  // Optional at creation — an admin can staff the team now or later via /assign.
  teamId: z.string().refine(mongoose.isValidObjectId).optional(),
})

const populateProject = (query: any) =>
  query
    .populate('owner', 'name email profilePicture role')
    .populate('members', 'name email profilePicture role')
    .populate({
      path: 'team',
      populate: [
        { path: 'teamLeader', select: 'name email role' },
        { path: 'members', select: 'name email role' },
      ],
    })

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    const skip = parseInt(request.nextUrl.searchParams.get('skip') || '0')
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10')

    const filter = { $or: [{ owner: user.userId }, { members: user.userId }] }

    const projects = await populateProject(Project.find(filter))
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const total = await Project.countDocuments(filter)

    return NextResponse.json({ projects, total, skip, limit }, { status: 200 })
  } catch (error) {
    console.error('Get projects error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Create a project. Admin-only: this is a closed, provisioned system — there
 * is no notion of a personal project a team_leader or developer spins up
 * themselves. Every project starts with the admin as its owner.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const body = await request.json()
    const validation = createProjectSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.issues },
        { status: 400 }
      )
    }

    const { teamId, ...fields } = validation.data
    const members = new Set<string>([auth.data.userId])
    let team: string | undefined
    let teamDoc: any = null

    if (teamId) {
      teamDoc = await Team.findById(teamId)
      if (!teamDoc) {
        return NextResponse.json({ error: 'Team not found' }, { status: 404 })
      }
      team = teamId
      members.add(teamDoc.teamLeader.toString())
      teamDoc.members.forEach((m: any) => members.add(m.toString()))
    }

    const project = await Project.create({
      ...fields,
      owner: auth.data.userId,
      team,
      members: [...members],
      progress: 0,
    })

    if (teamDoc) {
      const recipients = new Set<string>([
        teamDoc.teamLeader.toString(),
        ...teamDoc.members.map((m: any) => m.toString()),
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

    // A hydrated document's populate() returns a Promise per call rather than
    // being query-chainable — each path needs its own awaited call.
    await project.populate('owner', 'name email profilePicture role')
    await project.populate('members', 'name email profilePicture role')
    await project.populate({
      path: 'team',
      populate: [
        { path: 'teamLeader', select: 'name email role' },
        { path: 'members', select: 'name email role' },
      ],
    })

    return NextResponse.json(
      { message: 'Project created successfully', project },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
