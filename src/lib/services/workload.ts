import mongoose from 'mongoose'
import { Project, Task, Team } from '@/lib/db/models'
import { dayStartUTC } from '@/lib/due-date'
import { workloadStatus, type WorkloadStatus } from '@/lib/workload'
import type { DeveloperWorkload, TaskPriority, TaskStatus, WorkloadReport } from '@/types'

/** One group of the aggregation: how many tasks a person has with this status, priority and overdue flag. */
export interface TaskGroup {
  _id: { assignee: unknown; status: TaskStatus; priority: TaskPriority; overdue: boolean }
  count: number
}

interface RosterMember {
  id: string
  name: string
  teamId: string
}

const idOf = (value: any): string => String(value?._id ?? value)
const toObjectId = (id: string) => new mongoose.Types.ObjectId(id)

/**
 * Turn the grouped counts into one row per developer. Pure, so the counting
 * rules are testable without a database:
 *   active    = To Do + In Progress + In Review (a finished task is never current workload)
 *   overdue   = an active task past its due day (Feature #10's rule, decided in the query)
 *   high / urgent = active tasks of that priority
 */
export function buildDeveloperRows(roster: RosterMember[], groups: TaskGroup[]): DeveloperWorkload[] {
  const rows = new Map<string, DeveloperWorkload>(
    roster.map((m) => [
      m.id,
      {
        _id: m.id,
        name: m.name,
        teamId: m.teamId,
        activeTasks: 0,
        todo: 0,
        inProgress: 0,
        inReview: 0,
        completed: 0,
        totalTasks: 0,
        overdue: 0,
        high: 0,
        urgent: 0,
        workloadStatus: 'available',
      },
    ])
  )

  for (const group of groups) {
    const row = rows.get(idOf(group._id.assignee))
    if (!row) continue

    const { status, priority, overdue } = group._id
    const n = group.count
    row.totalTasks += n

    if (status === 'complete') {
      row.completed += n
      continue
    }

    row.activeTasks += n
    if (status === 'todo') row.todo += n
    else if (status === 'in-progress') row.inProgress += n
    else if (status === 'review') row.inReview += n
    if (overdue) row.overdue += n
    if (priority === 'high') row.high += n
    if (priority === 'urgent') row.urgent += n
  }

  for (const row of rows.values()) row.workloadStatus = workloadStatus(row.activeTasks)
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export type WorkloadResult = { ok: true; report: WorkloadReport } | { ok: false; status: 404; error: string }

/**
 * Who is carrying how much open work, across the projects the caller manages
 * (as their owner, or as the leader of their team: the same rule that lets
 * someone assign tasks). The scope is worked out first and the query is
 * confined to it, so nothing outside it is ever read.
 *
 * Who counts as a developer comes from the teams' rosters, never from who
 * happens to hold tasks. Four queries however many developers there are:
 * the leader's teams, the projects, those teams' rosters, and one grouped
 * count over the tasks.
 */
export async function getWorkload(params: {
  userId: string
  /** Administrators see every team and project; team leaders only the ones they manage. */
  isAdmin?: boolean
  teamId?: string
  projectId?: string
  workload?: WorkloadStatus
  /** The viewer's calendar date (YYYY-MM-DD); defaults to the server's UTC date. */
  today?: string
}): Promise<WorkloadResult> {
  const { userId, isAdmin, teamId, projectId, workload, today } = params

  const led: { _id: unknown }[] = await Team.find(isAdmin ? {} : { teamLeader: userId })
    .select('_id')
    .lean()
  const ledIds = led.map((t) => t._id)

  const projects: { _id: unknown; title: string; team?: unknown }[] = await Project.find(isAdmin ? {} : { $or: [{ owner: userId }, { team: { $in: ledIds } }] })
    .select('title team')
    .lean()

  const scopeTeamIds = new Set<string>([...ledIds.map(String), ...projects.filter((p) => p.team).map((p) => idOf(p.team))])
  const teams: { _id: unknown; name: string; members?: { _id: unknown; name?: string }[] }[] = scopeTeamIds.size
    ? await Team.find({ _id: { $in: [...scopeTeamIds] } })
        .select('name members')
        .populate('members', 'name')
        .lean()
    : []

  // A team or project that is not in the caller's scope looks exactly like one that does not exist.
  if (teamId && !scopeTeamIds.has(teamId)) return { ok: false, status: 404, error: 'Team not found' }
  if (projectId && !projects.some((p) => idOf(p._id) === projectId)) return { ok: false, status: 404, error: 'Project not found' }

  const options = {
    teams: teams.map((t) => ({ _id: idOf(t._id), name: t.name })).sort((a, b) => a.name.localeCompare(b.name)),
    projects: projects
      .map((p) => ({ _id: idOf(p._id), title: p.title, teamId: p.team ? idOf(p.team) : null }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  }

  const selected = projects.filter(
    (p) => (!projectId || idOf(p._id) === projectId) && (!teamId || (p.team && idOf(p.team) === teamId))
  )

  // The roster: the chosen team, else the chosen project's team, else every team in scope.
  const projectTeam = projectId ? projects.find((p) => idOf(p._id) === projectId)?.team : undefined
  const rosterTeamIds = teamId ? [teamId] : projectTeam ? [idOf(projectTeam)] : [...scopeTeamIds]

  const roster: RosterMember[] = []
  const seen = new Set<string>()
  for (const team of teams) {
    if (!rosterTeamIds.includes(idOf(team._id))) continue
    for (const member of team.members ?? []) {
      const id = idOf(member)
      if (seen.has(id) || !member.name) continue
      seen.add(id)
      roster.push({ id, name: member.name, teamId: idOf(team._id) })
    }
  }

  let groups: TaskGroup[] = []
  if (roster.length > 0 && selected.length > 0) {
    const start = dayStartUTC(today)
    groups = await Task.aggregate<TaskGroup>([
      { $match: { projectId: { $in: selected.map((p) => p._id) }, assignedTo: { $in: roster.map((m) => m.id).map(toObjectId) } } },
      {
        $group: {
          _id: {
            assignee: '$assignedTo',
            status: '$status',
            priority: '$priority',
            // A due day before today on a task that is not finished (Feature #10).
            overdue: { $and: [{ $eq: [{ $type: '$dueDate' }, 'date'] }, { $lt: ['$dueDate', start] }] },
          },
          count: { $sum: 1 },
        },
      },
    ])
  }

  const all = buildDeveloperRows(roster, groups)
  const developers = workload ? all.filter((d) => d.workloadStatus === workload) : all

  return {
    ok: true,
    report: {
      summary: {
        members: developers.length,
        activeTasks: developers.reduce((n, d) => n + d.activeTasks, 0),
        inReview: developers.reduce((n, d) => n + d.inReview, 0),
        overdue: developers.reduce((n, d) => n + d.overdue, 0),
      },
      developers,
      ...options,
    },
  }
}
