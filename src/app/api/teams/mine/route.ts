import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { Team, Project } from '@/lib/db/models'
import { authenticateRequest } from '@/lib/auth/middleware'

/**
 * The caller's own team roster(s) — where they're the leader or a member.
 * Unlike /api/admin/teams, this is open to any authenticated user: a
 * team_leader or developer needs to see who they work with without going
 * through the admin-only team directory.
 */
export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await connectToDatabase()

    const teams = await Team.find({
      $or: [{ teamLeader: user.userId }, { members: user.userId }],
    })
      .populate('teamLeader', 'name email role')
      .populate('members', 'name email role')
      .sort({ createdAt: -1 })

    // Show what each team is currently staffed on, so "my team" also answers
    // "what am I working on" without a second round trip.
    const teamIds = teams.map((t) => t._id)
    const projects = await Project.find({ team: { $in: teamIds } }).select(
      'title status team'
    )

    const teamsWithProjects = teams.map((team) => ({
      ...team.toObject(),
      projects: projects
        .filter((p) => p.team?.toString() === team._id.toString())
        .map((p) => ({ _id: p._id, title: p.title, status: p.status })),
    }))

    return NextResponse.json({ teams: teamsWithProjects }, { status: 200 })
  } catch (error) {
    console.error('Get my teams error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
