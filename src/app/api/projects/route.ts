import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { Project, Team } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { authenticateRequest } from '@/lib/auth/middleware'
import { PROJECT_POPULATE, composeMembers, teamRoster } from '@/lib/services/projects'
import { notifyProjectAssigned } from '@/lib/services/notifications'
import { parseBody, objectIdString } from '@/lib/validation'
import { parsePagination } from '@/lib/validation/query'
import { referenceLinksSchema } from '@/lib/validation/project-resources'
import { z } from 'zod'

const createProjectSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().max(500).optional(),
  requirements: z.string().max(5000).optional(),
  startDate: z.string().optional(),
  deadline: z.string().optional(),
  // Optional at creation — an admin can staff the team now or later via /assign.
  teamId: objectIdString.optional(),
  // Reference material for the team: the expected website, a Figma design, a brief…
  referenceLinks: referenceLinksSchema.optional(),
})

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    const { skip, limit } = parsePagination(request.nextUrl.searchParams, {
      defaultLimit: 10,
      maxLimit: 50,
    })

    const filter = { $or: [{ owner: user.userId }, { members: user.userId }] }

    const [projects, total] = await Promise.all([
      Project.find(filter)
        .populate(PROJECT_POPULATE)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Project.countDocuments(filter),
    ])

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

    const body = await parseBody(request, createProjectSchema)
    if (body.response) return body.response

    const { teamId, ...fields } = body.data

    const team = teamId ? await Team.findById(teamId) : null
    if (teamId && !team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    }

    const project = await Project.create({
      ...fields,
      owner: auth.data.userId,
      team: team?._id,
      members: composeMembers(auth.data.userId, [], team),
      progress: 0,
    })

    if (team) await notifyProjectAssigned(project, teamRoster(team), auth.data.userId)

    await project.populate(PROJECT_POPULATE)
    return NextResponse.json(
      { message: 'Project created successfully', project },
      { status: 201 }
    )
  } catch (error) {
    console.error('Create project error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

