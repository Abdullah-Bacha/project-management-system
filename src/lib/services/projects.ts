import type { PopulateOptions } from 'mongoose'
import { Activity, Project, Task, Comment, Notification, Report, Team } from '@/lib/db/models'
import { toId } from '@/lib/auth/membership'
import { notifyProjectAssigned } from './notifications'
import { deleteProjectAttachments } from './attachments'
import { deleteProjectDependencies } from './dependencies'
import { deleteProjectFiles } from './project-files'

type IdLike = Parameters<typeof toId>[0]
type TeamLike = { teamLeader: IdLike; members?: IdLike[] }

/**
 * What every project response carries: the owner, the members, and the team
 * with its leader and roster. Works on a query (`.populate(PROJECT_POPULATE)`)
 * and on a loaded document (`await project.populate(PROJECT_POPULATE)`).
 */
export const PROJECT_POPULATE: PopulateOptions[] = [
  { path: 'owner', select: 'name email profilePicture role' },
  { path: 'members', select: 'name email profilePicture role' },
  {
    path: 'team',
    populate: [
      { path: 'teamLeader', select: 'name email role' },
      { path: 'members', select: 'name email role' },
    ],
  },
]

/** Everyone on a team: the leader first, then the members. */
export function teamRoster(team?: TeamLike | null): string[] {
  if (!team) return []
  return [team.teamLeader, ...(team.members ?? [])]
    .map(toId)
    .filter((id): id is string => id !== null)
}

/**
 * A project's member list = its owner + anyone added by hand ("extras") + the
 * assigned team's roster. Every place that staffs a project goes through here
 * so the three rules cannot drift apart.
 */
export function composeMembers(
  ownerId: string,
  extras: Iterable<string>,
  team?: TeamLike | null
): string[] {
  return [...new Set([ownerId, ...extras, ...teamRoster(team)])]
}

/**
 * Recompute and persist a project's completion percentage:
 * completed tasks / total tasks × 100, and 0 when there are no tasks.
 */
export async function syncProjectProgress(projectId: unknown) {
  const [total, completed] = await Promise.all([
    Task.countDocuments({ projectId }),
    Task.countDocuments({ projectId, status: 'complete' }),
  ])

  await Project.findByIdAndUpdate(projectId, {
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
  })
}

/**
 * Staff a team onto a project (or clear it with `null`). The previous team's
 * people are replaced, hand-added members are kept, and only people who were
 * not already on the project are notified — re-assigning the same team is
 * silent.
 */
export async function assignTeamToProject(project: any, team: any | null, actorId: string) {
  const before = new Set<string>(project.members.map(toId))
  const oldTeam = project.team ? await Team.findById(project.team) : null
  const oldRoster = new Set(teamRoster(oldTeam))

  const extras = [...before].filter((id) => !oldRoster.has(id))
  const owner = toId(project.owner)!

  project.team = team ? team._id : undefined
  project.members = composeMembers(owner, extras, team)
  await project.save()

  if (team) {
    const added = teamRoster(team).filter((id) => !before.has(id))
    await notifyProjectAssigned(project, added, actorId)
  }
}

/**
 * After a team's roster changes, rebuild the member list of every project it
 * is staffed on. People added by hand (not in the old roster) are kept;
 * people removed from the team lose access.
 */
export async function syncStaffedProjects(team: any, previousRoster: Set<string>) {
  const projects = await Project.find({ team: team._id })

  for (const project of projects) {
    const extras = project.members.map(toId).filter((id: string | null) => id && !previousRoster.has(id))
    project.members = composeMembers(toId(project.owner)!, extras as string[], team)
    await project.save()
  }
}

/** Delete a project and everything that hangs off it. */
export async function deleteProjectCascade(projectId: string) {
  // Files first, while the records that point at them still exist.
  await deleteProjectAttachments(projectId)
  await deleteProjectFiles(projectId)
  const taskIds = (await Task.find({ projectId }).select('_id')).map((t) => t._id)

  await Promise.all([
    Comment.deleteMany({ taskId: { $in: taskIds } }),
    Task.deleteMany({ projectId }),
    Notification.deleteMany({ projectId }),
    Activity.deleteMany({ projectId }),
    deleteProjectDependencies(projectId),
    Report.deleteMany({ project: projectId }),
  ])
  await Project.findByIdAndDelete(projectId)

  return { deletedTasks: taskIds.length }
}
