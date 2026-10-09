import { Project, Task, Team, User } from '@/lib/db/models'
import { toId } from '@/lib/auth/membership'
import type { SearchResults, UserRole } from '@/types'

const PER_KIND = 5
const MAX_PROJECTS_SCANNED = 200

/** Escape user input before embedding it in a RegExp. */
function escapeRegex(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Search the signed-in user's workspace.
 *
 * Nothing here widens access, it only reuses the existing rules:
 *  - projects: those the user owns or belongs to;
 *  - tasks: every task in projects the user owns or whose team they lead, and
 *    only their own assigned tasks anywhere else (the same rule as the task lists);
 *  - people: an admin may look through the whole directory (as with
 *    /api/users/search); everyone else only finds the people they already share
 *    a project with (the project's members page shows them anyway), by name only,
 *    so a search term cannot be used to probe other people's email addresses.
 *    Suspended accounts never show up.
 */
export async function searchWorkspace(
  user: { userId: string; role: UserRole },
  query: string
): Promise<SearchResults> {
  const pattern = new RegExp(escapeRegex(query), 'i')

  const projects = await Project.find({ $or: [{ owner: user.userId }, { members: user.userId }] })
    .select('title status owner members team')
    .sort({ updatedAt: -1 })
    .limit(MAX_PROJECTS_SCANNED)
    .lean()

  const titleById = new Map(projects.map((p) => [String(p._id), p.title as string]))

  // Projects the user manages: ones they own, or whose team they lead.
  const ledTeams = await Team.find({ teamLeader: user.userId }).select('_id').lean()
  const ledTeamIds = new Set(ledTeams.map((t) => String(t._id)))
  const managedIds = projects
    .filter((p) => String((p as any).owner) === user.userId || ((p as any).team && ledTeamIds.has(String((p as any).team))))
    .map((p) => p._id)

  const [tasks, people] = await Promise.all([
    Task.find({
      projectId: { $in: projects.map((p) => p._id) },
      title: pattern,
      $or: [{ projectId: { $in: managedIds } }, { assignedTo: user.userId }],
    })
      .select('title status priority projectId')
      .sort({ updatedAt: -1 })
      .limit(PER_KIND)
      .lean(),
    findPeople(user, pattern, projects),
  ])

  return {
    projects: projects
      .filter((p) => pattern.test(p.title as string))
      .slice(0, PER_KIND)
      .map((p) => ({ _id: String(p._id), title: p.title, status: p.status })),
    tasks: tasks.map((t) => ({
      _id: String(t._id),
      title: t.title,
      status: t.status,
      priority: t.priority,
      project: { _id: String(t.projectId), title: titleById.get(String(t.projectId)) ?? '' },
    })),
    people,
  }
}

async function findPeople(
  user: { userId: string; role: UserRole },
  pattern: RegExp,
  projects: { owner?: unknown; members?: unknown[] }[]
): Promise<SearchResults['people']> {
  const notSuspended = { status: { $ne: 'suspended' } }

  if (user.role === 'admin') {
    const found = await User.find({
      _id: { $ne: user.userId },
      ...notSuspended,
      $or: [{ name: pattern }, { email: pattern }],
    })
      .select('name email role')
      .limit(PER_KIND)
      .lean()
    return found.map((u) => ({ _id: String(u._id), name: u.name, role: u.role, email: u.email }))
  }

  const colleagues = new Set<string>()
  for (const project of projects) {
    for (const member of [project.owner, ...(project.members ?? [])]) {
      const id = toId(member as Parameters<typeof toId>[0])
      if (id && id !== user.userId) colleagues.add(id)
    }
  }
  if (colleagues.size === 0) return []

  const found = await User.find({ _id: { $in: [...colleagues] }, ...notSuspended, name: pattern })
    .select('name role')
    .limit(PER_KIND)
    .lean()
  return found.map((u) => ({ _id: String(u._id), name: u.name, role: u.role }))
}
