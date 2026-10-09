import mongoose from 'mongoose'
import { Project, Task, TaskDependency, Team } from '@/lib/db/models'
import { buildTrend, DEFAULT_TIME_ZONE, rangeInstants, resolveRange, summarizeTasks, type SnapshotGroup } from '@/lib/analytics'
import { dayStartUTC } from '@/lib/due-date'
import { buildDeveloperRows, type TaskGroup } from '@/lib/services/workload'
import { WORKLOAD_STATUSES } from '@/lib/workload'
import {
  TASK_PRIORITIES,
  type AnalyticsReport,
  type BlockedTask,
  type CountByProject,
  type OverdueTask,
  type TaskPriority,
  type TaskStatus,
  type TeamPerformance,
} from '@/types'

const DAY_MS = 86_400_000
const OVERDUE_LIST_LIMIT = 25
const BLOCKED_LIST_LIMIT = 10

const idOf = (value: any): string => String(value?._id ?? value)
const toObjectId = (id: string) => new mongoose.Types.ObjectId(id)

export type AnalyticsResult = { ok: true; report: AnalyticsReport } | { ok: false; status: 400 | 404; error: string }

/**
 * Reports & Analytics for administrators and team leaders.
 *
 * Scope first, data second: the caller's projects are worked out before any
 * task is read (admin: all; team leader: the projects they own or whose team
 * they lead, the same rule as Team Workload), and every query is confined to
 * those project ids. A team or project outside the scope looks exactly like one
 * that does not exist. Team membership comes from the team rosters, never from
 * who happens to hold tasks.
 *
 * Four kinds of numbers, each from one grouped query (no per-project queries):
 *   current state  – tasks grouped by project/status/priority/overdue-age
 *   by assignee    – the same grouping per developer, for Team Workload's counts
 *   blocked        – open blockers via the TaskDependency model (Feature #13)
 *   in the period  – created / completed per day inside the chosen range
 * Current-state numbers ignore the date range; only the period numbers use it.
 */
export async function getAnalytics(params: {
  userId: string
  isAdmin?: boolean
  teamId?: string
  projectId?: string
  from?: string
  to?: string
  /** The viewer's calendar date (YYYY-MM-DD); the server's UTC date when absent. */
  today?: string
  /** The viewer's IANA time zone, for which local day an event falls on. UTC when absent. */
  timeZone?: string
}): Promise<AnalyticsResult> {
  const { userId, isAdmin, teamId, projectId } = params
  const timeZone = params.timeZone ?? DEFAULT_TIME_ZONE
  const start = dayStartUTC(params.today)
  const today = start.toISOString().slice(0, 10)

  const range = resolveRange({ from: params.from, to: params.to, today })
  if (!range.ok) return { ok: false, status: 400, error: range.error }

  // ---- scope -----------------------------------------------------------
  const led: { _id: unknown }[] = await Team.find(isAdmin ? {} : { teamLeader: userId }).select('_id').lean()
  const ledIds = led.map((t) => t._id)

  const allProjects: { _id: unknown; title: string; team?: unknown }[] = await Project.find(
    isAdmin ? {} : { $or: [{ owner: userId }, { team: { $in: ledIds } }] }
  )
    .select('title team')
    .lean()

  const scopeTeamIds = new Set<string>([...ledIds.map(String), ...allProjects.filter((p) => p.team).map((p) => idOf(p.team))])
  const teams: { _id: unknown; name: string; members?: { _id: unknown; name?: string }[] }[] = scopeTeamIds.size
    ? await Team.find({ _id: { $in: [...scopeTeamIds] } })
        .select('name members')
        .populate('members', 'name')
        .lean()
    : []

  if (teamId && !scopeTeamIds.has(teamId)) return { ok: false, status: 404, error: 'Team not found' }
  if (projectId && !allProjects.some((p) => idOf(p._id) === projectId)) return { ok: false, status: 404, error: 'Project not found' }

  const options = {
    teams: teams.map((t) => ({ _id: idOf(t._id), name: t.name })).sort((a, b) => a.name.localeCompare(b.name)),
    projects: allProjects
      .map((p) => ({ _id: idOf(p._id), title: p.title, teamId: p.team ? idOf(p.team) : null }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  }

  const selected = allProjects.filter(
    (p) => (!projectId || idOf(p._id) === projectId) && (!teamId || (p.team && idOf(p.team) === teamId))
  )
  const selectedInfo = selected.map((p) => ({ _id: idOf(p._id), title: p.title }))
  const titleOf = new Map(selectedInfo.map((p) => [p._id, p.title]))
  const projectIds = selected.map((p) => p._id)

  // Team Workload's roster rule: the chosen team, else the chosen project's team, else every team in scope.
  const projectTeam = projectId ? allProjects.find((p) => idOf(p._id) === projectId)?.team : undefined
  const rosterTeamIds = teamId ? [teamId] : projectTeam ? [idOf(projectTeam)] : [...scopeTeamIds]
  const rosterTeams = teams.filter((t) => rosterTeamIds.includes(idOf(t._id)))

  const roster: { id: string; name: string; teamId: string }[] = []
  const seen = new Set<string>()
  for (const team of rosterTeams) {
    for (const member of team.members ?? []) {
      const id = idOf(member)
      if (seen.has(id) || !member.name) continue
      seen.add(id)
      roster.push({ id, name: member.name, teamId: idOf(team._id) })
    }
  }

  // ---- queries ---------------------------------------------------------
  // The range is local days: from the first local midnight up to the one after the last day.
  const { start: periodStart, endExclusive: periodEnd } = rangeInstants(range, timeZone)
  const inPeriod = (field: string) => ({ [field]: { $gte: periodStart, $lt: periodEnd } })
  const byDay = (field: string) => [
    { $match: inPeriod(field) },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: timeZone } }, n: { $sum: 1 } } },
  ]

  const empty = projectIds.length === 0

  const [snapshot, byAssignee, blockedFacet, period, overdueDocs] = await Promise.all([
    empty
      ? []
      : Task.aggregate<SnapshotGroup>([
          { $match: { projectId: { $in: projectIds } } },
          {
            $group: {
              _id: {
                projectId: '$projectId',
                status: '$status',
                priority: '$priority',
                // How far past its due day an open task is (Feature #10: due today is not overdue).
                age: {
                  $cond: [
                    { $and: [{ $ne: ['$status', 'complete'] }, { $eq: [{ $type: '$dueDate' }, 'date'] }, { $lt: ['$dueDate', start] }] },
                    {
                      $let: {
                        vars: { d: { $ceil: { $divide: [{ $subtract: [start, '$dueDate'] }, DAY_MS] } } },
                        in: { $switch: { branches: [{ case: { $lte: ['$$d', 3] }, then: '1-3' }, { case: { $lte: ['$$d', 7] }, then: '4-7' }], default: '8+' } },
                      },
                    },
                    'none',
                  ],
                },
                noStamp: { $and: [{ $eq: ['$status', 'complete'] }, { $ne: [{ $type: '$completedAt' }, 'date'] }] },
              },
              count: { $sum: 1 },
            },
          },
        ]),

    // Per developer, exactly as Team Workload counts it (buildDeveloperRows).
    roster.length === 0 || empty
      ? []
      : Task.aggregate<TaskGroup>([
          { $match: { projectId: { $in: projectIds }, assignedTo: { $in: roster.map((m) => toObjectId(m.id)) } } },
          {
            $group: {
              _id: {
                assignee: '$assignedTo',
                status: '$status',
                priority: '$priority',
                overdue: { $and: [{ $eq: [{ $type: '$dueDate' }, 'date'] }, { $lt: ['$dueDate', start] }] },
              },
              count: { $sum: 1 },
            },
          },
        ]),

    // Open tasks that have at least one unfinished blocker, each once however many blockers it has.
    empty
      ? []
      : TaskDependency.aggregate([
          { $match: { projectId: { $in: projectIds } } },
          {
            $lookup: {
              from: 'tasks',
              localField: 'blockingTaskId',
              foreignField: '_id',
              pipeline: [{ $project: { status: 1 } }],
              as: 'blocker',
            },
          },
          { $unwind: '$blocker' },
          { $match: { 'blocker.status': { $ne: 'complete' } } },
          { $group: { _id: '$blockedTaskId', openBlockers: { $sum: 1 } } },
          {
            $lookup: {
              from: 'tasks',
              localField: '_id',
              foreignField: '_id',
              pipeline: [{ $match: { status: { $ne: 'complete' } } }, { $project: { title: 1, projectId: 1, priority: 1, assignedTo: 1 } }],
              as: 'task',
            },
          },
          { $unwind: '$task' },
          {
            $facet: {
              byProject: [{ $group: { _id: '$task.projectId', n: { $sum: 1 } } }],
              byPriority: [{ $group: { _id: '$task.priority', n: { $sum: 1 } } }],
              byAssignee: [{ $match: { 'task.assignedTo': { $exists: true } } }, { $group: { _id: '$task.assignedTo', n: { $sum: 1 } } }],
              top: [
                { $sort: { openBlockers: -1, 'task.title': 1 } },
                { $limit: BLOCKED_LIST_LIMIT },
                { $project: { openBlockers: 1, title: '$task.title', projectId: '$task.projectId', priority: '$task.priority' } },
              ],
            },
          },
        ]),

    empty
      ? []
      : Task.aggregate([
          { $match: { projectId: { $in: projectIds }, $or: [inPeriod('createdAt'), inPeriod('completedAt')] } },
          { $facet: { created: byDay('createdAt'), completed: byDay('completedAt') } },
        ]),

    empty
      ? []
      : Task.find({ projectId: { $in: projectIds }, status: { $ne: 'complete' }, dueDate: { $lt: start } })
          .sort({ dueDate: 1, _id: 1 })
          .limit(OVERDUE_LIST_LIMIT)
          .select('title projectId priority dueDate assignedTo')
          .populate('assignedTo', 'name')
          .lean(),
  ])

  // ---- blocked -----------------------------------------------------------
  const facet: any = (blockedFacet as any[])[0] ?? { byProject: [], byPriority: [], byAssignee: [], top: [] }
  const blockedByProject = new Map<string, number>(facet.byProject.map((r: any) => [idOf(r._id), r.n]))
  const blockedByAssignee = new Map<string, number>(facet.byAssignee.map((r: any) => [idOf(r._id), r.n]))
  const blockedPriority = Object.fromEntries(TASK_PRIORITIES.map((p) => [p, 0])) as Record<TaskPriority, number>
  for (const r of facet.byPriority as { _id: TaskPriority; n: number }[]) if (r._id in blockedPriority) blockedPriority[r._id] += r.n
  const blockedTotal = [...blockedByProject.values()].reduce((a, b) => a + b, 0)

  // The unfinished prerequisites of the few tasks shown (one extra query, never per task).
  const topTasks = facet.top as { _id: unknown; title: string; projectId: unknown; priority: TaskPriority; openBlockers: number }[]
  const waiting = new Map<string, { _id: string; title: string; status: TaskStatus }[]>()
  if (topTasks.length > 0) {
    const edges: { blockingTaskId: unknown; blockedTaskId: unknown }[] = await TaskDependency.find({ blockedTaskId: { $in: topTasks.map((t) => t._id) } })
      .select('blockingTaskId blockedTaskId')
      .lean()
    const blockers: { _id: unknown; title: string; status: TaskStatus }[] = await Task.find({ _id: { $in: edges.map((e) => e.blockingTaskId) }, status: { $ne: 'complete' } })
      .select('title status')
      .lean()
    const blockerById = new Map(blockers.map((b) => [idOf(b._id), b]))
    for (const edge of edges) {
      const b = blockerById.get(idOf(edge.blockingTaskId))
      if (!b) continue
      const list = waiting.get(idOf(edge.blockedTaskId)) ?? []
      if (list.length < 3) list.push({ _id: idOf(b._id), title: b.title, status: b.status })
      waiting.set(idOf(edge.blockedTaskId), list)
    }
  }
  const top: BlockedTask[] = topTasks.map((t) => ({
    _id: idOf(t._id),
    title: t.title,
    priority: t.priority,
    projectId: idOf(t.projectId),
    projectTitle: titleOf.get(idOf(t.projectId)) ?? '',
    openBlockers: t.openBlockers,
    waitingOn: waiting.get(idOf(t._id)) ?? [],
  }))

  // ---- assemble ----------------------------------------------------------
  const summary = summarizeTasks(snapshot, selectedInfo, blockedByProject)

  const developers = buildDeveloperRows(roster.map((m) => ({ id: m.id, name: m.name, teamId: m.teamId })), byAssignee)
  const teamRows: TeamPerformance[] = rosterTeams
    .map((team) => {
      const tid = idOf(team._id)
      const devs = developers.filter((d) => d.teamId === tid)
      const workload = Object.fromEntries(WORKLOAD_STATUSES.map((s) => [s, 0])) as TeamPerformance['workload']
      for (const d of devs) workload[d.workloadStatus] += 1
      return {
        _id: tid,
        name: team.name,
        developers: devs.length,
        activeTasks: devs.reduce((n, d) => n + d.activeTasks, 0),
        inReview: devs.reduce((n, d) => n + d.inReview, 0),
        completed: devs.reduce((n, d) => n + d.completed, 0),
        overdue: devs.reduce((n, d) => n + d.overdue, 0),
        blocked: devs.reduce((n, d) => n + (blockedByAssignee.get(d._id) ?? 0), 0),
        workload,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const pf: any = (period as any[])[0] ?? { created: [], completed: [] }
  const toMap = (rows: { _id: string; n: number }[]) => new Map(rows.map((r) => [r._id, r.n]))
  const created = toMap(pf.created)
  const completed = toMap(pf.completed)
  const trend = buildTrend(range, created, completed)
  const sumMap = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)

  const overdueTasks: OverdueTask[] = (overdueDocs as any[]).map((t) => ({
    _id: idOf(t._id),
    title: t.title,
    priority: t.priority,
    dueDate: new Date(t.dueDate).toISOString(),
    projectId: idOf(t.projectId),
    projectTitle: titleOf.get(idOf(t.projectId)) ?? '',
    assignee: t.assignedTo?.name ?? null,
  }))

  const blockedByProjectList: CountByProject[] = [...blockedByProject.entries()]
    .map(([id, count]) => ({ _id: id, title: titleOf.get(id) ?? '', count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))

  return {
    ok: true,
    report: {
      range: { from: range.from, to: range.to, days: range.days, today, timeZone },
      options,
      overview: {
        projects: selected.length,
        tasks: summary.totals.tasks,
        completed: summary.totals.completed,
        active: summary.totals.active,
        inReview: summary.totals.inReview,
        overdue: summary.totals.overdue,
        completionRate: summary.totals.completionRate,
        blocked: blockedTotal,
        createdInPeriod: sumMap(created),
        completedInPeriod: sumMap(completed),
      },
      status: summary.status,
      priority: summary.priority,
      trend: { ...trend, completedWithoutTimestamp: summary.completedWithoutTimestamp },
      projects: summary.projectRows.map((r) => ({ ...r, blocked: blockedByProject.get(r._id) ?? 0 })),
      teams: teamRows,
      developers,
      overdue: {
        total: summary.totals.overdue,
        byProject: summary.overdue.byProject,
        byPriority: summary.overdue.byPriority,
        byAge: summary.overdue.byAge,
        tasks: overdueTasks,
      },
      blocked: { total: blockedTotal, byProject: blockedByProjectList, byPriority: blockedPriority, top },
    },
  }
}
