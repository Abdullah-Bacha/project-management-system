import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Reports & Analytics at the route level. Only the database and the caller are
 * stubbed, so the real scope rules, validation and calculations run.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    teamFind: vi.fn(),
    projectFind: vi.fn(),
    taskAggregate: vi.fn(),
    taskFind: vi.fn(),
    depAggregate: vi.fn(),
    depFind: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Team: { find: m.teamFind },
  Project: { find: m.projectFind },
  Task: { aggregate: m.taskAggregate, find: m.taskFind },
  TaskDependency: { aggregate: m.depAggregate, find: m.depFind },
}))

import { GET } from './analytics/route'

const id = (c: string) => c.repeat(24)
const LEADER = id('b')
const ADMIN = id('a')
const TEAM = id('3')
const OTHER_TEAM = id('4')
const PROJECT = id('2')
const OTHER_PROJECT = id('5')
const ANA = id('c')
const BEN = id('d')
const ZED = id('9')
const TASK_A = id('6')

const chain = (value: unknown) => {
  const q: any = {}
  for (const step of ['populate', 'sort', 'select', 'limit']) q[step] = () => q
  q.lean = () => Promise.resolve(value)
  return q
}

const as = (userId: string | null, role = 'team_leader') =>
  m.authenticate.mockResolvedValue(userId ? { user: { userId, role }, error: null } : { user: null, error: 'Unauthorized' })

const TODAY = '2026-10-09'
const call = (query = '') => GET(new NextRequest(`http://localhost/api/analytics?today=${TODAY}${query}`))

const snap = (projectId: string, status: string, count: number, extra: Record<string, unknown> = {}) => ({
  _id: { projectId, status, priority: 'medium', age: 'none', noStamp: false, ...extra },
  count,
})

/** Which of the three Task.aggregate calls is this? */
const kind = (pipeline: any[]) => {
  if (pipeline[1]?.$facet) return 'period'
  const key = pipeline[1]?.$group?._id ?? {}
  return 'assignee' in key ? 'assignee' : 'snapshot'
}

let snapshot: unknown[]
let byAssignee: unknown[]
let period: unknown[]

beforeEach(() => {
  vi.resetAllMocks()
  snapshot = []
  byAssignee = []
  period = []
  m.teamFind.mockImplementation((filter: any) =>
    chain(
      filter?._id
        ? [
            { _id: TEAM, name: 'Alpha', members: [{ _id: ANA, name: 'Ana' }, { _id: BEN, name: 'Ben' }] },
            { _id: OTHER_TEAM, name: 'Beta', members: [{ _id: ZED, name: 'Zed' }] },
          ].filter((t) => filter._id.$in.includes(t._id))
        : filter?.teamLeader
          ? [{ _id: TEAM }]
          : [{ _id: TEAM }, { _id: OTHER_TEAM }]
    )
  )
  m.projectFind.mockImplementation((filter: any) =>
    chain(
      filter?.$or
        ? [{ _id: PROJECT, title: 'Site', team: TEAM }]
        : [
            { _id: PROJECT, title: 'Site', team: TEAM },
            { _id: OTHER_PROJECT, title: 'App', team: OTHER_TEAM },
          ]
    )
  )
  m.taskAggregate.mockImplementation(async (pipeline: any[]) => {
    const k = kind(pipeline)
    return k === 'snapshot' ? snapshot : k === 'assignee' ? byAssignee : period
  })
  m.taskFind.mockImplementation((filter: any) => chain(filter?.dueDate ? [] : []))
  m.depAggregate.mockResolvedValue([])
  m.depFind.mockImplementation(() => chain([]))
})

describe('who can ask', () => {
  it('signed-out callers get 401 and nothing is read', async () => {
    as(null)
    expect((await call()).status).toBe(401)
    expect(m.teamFind).not.toHaveBeenCalled()
    expect(m.taskAggregate).not.toHaveBeenCalled()
  })

  it('developers get 403 and no data', async () => {
    as(ANA, 'developer')
    const res = await call()
    expect(res.status).toBe(403)
    expect(m.taskAggregate).not.toHaveBeenCalled()
    expect(m.projectFind).not.toHaveBeenCalled()
  })

  it.each(['admin', 'team_leader'])('%s may ask', async (role) => {
    as(role === 'admin' ? ADMIN : LEADER, role)
    expect((await call()).status).toBe(200)
  })
})

describe('scope and isolation', () => {
  it('a team leader is limited to the projects they manage, and so is every query', async () => {
    as(LEADER)
    const body = await (await call()).json()
    expect(m.teamFind.mock.calls[0][0]).toEqual({ teamLeader: LEADER })
    expect(body.options.projects.map((p: any) => p._id)).toEqual([PROJECT])
    expect(body.options.teams).toEqual([{ _id: TEAM, name: 'Alpha' }])
    expect(body.teams.map((t: any) => t.name)).toEqual(['Alpha'])
    for (const [pipeline] of m.taskAggregate.mock.calls) {
      expect(pipeline[0].$match.projectId.$in).toEqual([PROJECT])
    }
    expect(m.depAggregate.mock.calls[0][0][0].$match.projectId.$in).toEqual([PROJECT])
  })

  it('an administrator sees every project and team', async () => {
    as(ADMIN, 'admin')
    const body = await (await call()).json()
    expect(body.overview.projects).toBe(2)
    expect(body.teams.map((t: any) => t.name)).toEqual(['Alpha', 'Beta'])
  })

  it('a team or project outside a leader scope is a 404 and reads no tasks', async () => {
    as(LEADER)
    expect((await call(`&teamId=${OTHER_TEAM}`)).status).toBe(404)
    expect((await call(`&projectId=${OTHER_PROJECT}`)).status).toBe(404)
    expect(m.taskAggregate).not.toHaveBeenCalled()
  })

  it('another team data never appears in a leader response', async () => {
    as(LEADER)
    snapshot = [snap(PROJECT, 'todo', 1), snap(OTHER_PROJECT, 'todo', 50)]
    const text = JSON.stringify(await (await call()).json())
    expect(text).not.toContain('Zed')
    expect(text).not.toContain('Beta')
    expect(text).not.toContain('"App"')
  })

  it('a team filter narrows the projects and the roster', async () => {
    as(ADMIN, 'admin')
    const body = await (await call(`&teamId=${OTHER_TEAM}`)).json()
    expect(body.overview.projects).toBe(1)
    expect(body.teams.map((t: any) => t.name)).toEqual(['Beta'])
    const assignee = m.taskAggregate.mock.calls.map(([p]) => p).find((p) => kind(p) === 'assignee')!
    expect(assignee[0].$match.assignedTo.$in.map(String)).toEqual([ZED])
  })
})

describe('validation', () => {
  it.each([
    '&teamId=abc',
    '&projectId=%7B%22%24ne%22%3Anull%7D',
    '&from=2026-02-30',
    '&to=2026-13-01',
    '&from=10/01/2026',
    '&from=2026-10-08&to=2026-10-01',
    '&from=2020-01-01&to=2026-10-01',
  ])('rejects %s with 400 and reads nothing', async (q) => {
    as(LEADER)
    const res = await call(q)
    expect(res.status).toBe(400)
    expect(m.taskAggregate).not.toHaveBeenCalled()
  })

  it('rejects an impossible "today"', async () => {
    as(LEADER)
    expect((await GET(new NextRequest('http://localhost/api/analytics?today=2026-02-30'))).status).toBe(400)
  })

  it('operator-style parameters cannot reach a query', async () => {
    as(LEADER)
    for (const q of ['&projectId[$ne]=x', '&teamId[$gt]=', '&$where=1', '&from[$ne]=1']) {
      const res = await call(q)
      // Unknown or bracketed keys are ignored; nothing but validated strings is ever used.
      expect([200, 400]).toContain(res.status)
    }
    const serialized = JSON.stringify([m.taskAggregate.mock.calls, m.teamFind.mock.calls, m.projectFind.mock.calls])
    expect(serialized).not.toContain('$where')
    expect(serialized).not.toContain('"$ne":"x"')
  })
})

describe('numbers', () => {
  it('no tasks: zeros, no NaN, empty distributions', async () => {
    as(LEADER)
    const body = await (await call()).json()
    expect(body.overview).toMatchObject({ projects: 1, tasks: 0, completed: 0, active: 0, overdue: 0, completionRate: 0, blocked: 0 })
    expect(body.projects).toEqual([expect.objectContaining({ title: 'Site', total: 0, completionRate: 0 })])
    expect(body.trend.points.every((p: any) => p.created === 0 && p.completed === 0)).toBe(true)
  })

  it('no projects in scope: an empty report and no task queries', async () => {
    as(LEADER)
    m.projectFind.mockImplementation(() => chain([]))
    m.teamFind.mockImplementation(() => chain([]))
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).overview.tasks).toBe(0)
    expect(m.taskAggregate).not.toHaveBeenCalled()
  })

  it('status, completion, overdue and in-review come out right', async () => {
    as(LEADER)
    snapshot = [
      snap(PROJECT, 'todo', 2),
      snap(PROJECT, 'in-progress', 1, { age: '1-3', priority: 'high' }),
      snap(PROJECT, 'review', 1),
      snap(PROJECT, 'complete', 4),
    ]
    const body = await (await call()).json()
    expect(body.overview).toMatchObject({ tasks: 8, completed: 4, active: 4, inReview: 1, overdue: 1, completionRate: 50 })
    expect(body.status).toEqual({ todo: 2, 'in-progress': 1, review: 1, complete: 4 })
    expect(body.overdue.byAge).toEqual({ '1-3': 1, '4-7': 0, '8+': 0 })
    expect(body.overdue.byPriority.high).toBe(1)
  })

  it('the overdue rule sent to the database is: open, due day before the viewer\'s today (due today is not overdue)', async () => {
    as(LEADER)
    await call()
    const snapshotPipeline = m.taskAggregate.mock.calls.map(([p]) => p).find((p) => kind(p) === 'snapshot')!
    const age = snapshotPipeline[1].$group._id.age.$cond[0].$and
    expect(age[0]).toEqual({ $ne: ['$status', 'complete'] })
    expect(age[2].$lt[1]).toEqual(new Date(`${TODAY}T00:00:00Z`)) // strictly before today's midnight
    const list = m.taskFind.mock.calls.find(([f]) => f?.dueDate)![0]
    expect(list.status).toEqual({ $ne: 'complete' })
    expect(list.dueDate).toEqual({ $lt: new Date(`${TODAY}T00:00:00Z`) })
  })

  it('the date range filters only the period numbers, using the chosen UTC days', async () => {
    as(LEADER)
    period = [{ created: [{ _id: '2026-10-02', n: 3 }], completed: [{ _id: '2026-10-03', n: 2 }] }]
    snapshot = [snap(PROJECT, 'todo', 10)]
    const body = await (await call('&from=2026-10-01&to=2026-10-07')).json()
    expect(body.range).toMatchObject({ from: '2026-10-01', to: '2026-10-07', days: 7 })
    expect(body.overview).toMatchObject({ createdInPeriod: 3, completedInPeriod: 2, tasks: 10 })
    expect(body.trend.granularity).toBe('day')
    expect(body.trend.points).toHaveLength(7)

    const periodPipeline = m.taskAggregate.mock.calls.map(([p]) => p).find((p) => kind(p) === 'period')!
    const created = periodPipeline[1].$facet.created[0].$match.createdAt
    expect(created).toEqual({ $gte: new Date('2026-10-01T00:00:00Z'), $lt: new Date('2026-10-08T00:00:00Z') })
  })

  it('completed tasks with no completion date are reported, not turned into history', async () => {
    as(LEADER)
    snapshot = [snap(PROJECT, 'complete', 3, { noStamp: true })]
    period = [] // nothing carries a completedAt in range
    const body = await (await call()).json()
    expect(body.overview.completed).toBe(3)
    expect(body.overview.completedInPeriod).toBe(0)
    expect(body.trend.completedWithoutTimestamp).toBe(3)
    expect(body.trend.points.reduce((n: number, p: any) => n + p.completed, 0)).toBe(0)
  })

  it('team performance reuses the Feature #12 bands and counts blocked tasks per roster member', async () => {
    as(LEADER)
    const grp = (assignee: string, status: string, count: number, overdue = false) => ({
      _id: { assignee, status, priority: 'medium', overdue },
      count,
    })
    byAssignee = [grp(ANA, 'todo', 7), grp(BEN, 'in-progress', 2), grp(BEN, 'review', 1, true), grp(BEN, 'complete', 5)]
    m.depAggregate.mockResolvedValue([
      {
        byProject: [{ _id: PROJECT, n: 2 }],
        byPriority: [{ _id: 'high', n: 2 }],
        byAssignee: [{ _id: BEN, n: 2 }],
        top: [],
      },
    ])
    const body = await (await call()).json()
    expect(body.teams).toEqual([
      {
        _id: TEAM,
        name: 'Alpha',
        developers: 2,
        activeTasks: 10,
        inReview: 1,
        completed: 5,
        overdue: 1,
        blocked: 2,
        workload: { available: 0, normal: 1, high: 0, overloaded: 1 }, // Ben 3 active → normal, Ana 7 → overloaded
      },
    ])
  })

  it('blocked: each task counted once however many blockers, with the open blockers it waits on', async () => {
    as(LEADER)
    m.depAggregate.mockResolvedValue([
      {
        byProject: [{ _id: PROJECT, n: 1 }],
        byPriority: [{ _id: 'urgent', n: 1 }],
        byAssignee: [],
        top: [{ _id: TASK_A, title: 'Ship', projectId: PROJECT, priority: 'urgent', openBlockers: 3 }],
      },
    ])
    m.depFind.mockImplementation(() =>
      chain([
        { blockingTaskId: id('7'), blockedTaskId: TASK_A },
        { blockingTaskId: id('8'), blockedTaskId: TASK_A },
        { blockingTaskId: id('1'), blockedTaskId: TASK_A }, // finished prerequisite: filtered out below
      ])
    )
    m.taskFind.mockImplementation((filter: any) =>
      chain(
        filter?.dueDate
          ? []
          : [
              { _id: id('7'), title: 'Design', status: 'in-progress' },
              { _id: id('8'), title: 'API', status: 'todo' },
            ]
      )
    )
    const body = await (await call()).json()
    expect(body.overview.blocked).toBe(1)
    expect(body.blocked.total).toBe(1)
    expect(body.blocked.byPriority).toEqual({ low: 0, medium: 0, high: 0, urgent: 1 })
    expect(body.blocked.top).toEqual([
      {
        _id: TASK_A,
        title: 'Ship',
        priority: 'urgent',
        projectId: PROJECT,
        projectTitle: 'Site',
        openBlockers: 3,
        waitingOn: [
          { _id: id('7'), title: 'Design', status: 'in-progress' },
          { _id: id('8'), title: 'API', status: 'todo' },
        ],
      },
    ])
    // Resolved blockers and finished blocked tasks are excluded by the pipeline itself.
    const pipeline = m.depAggregate.mock.calls[0][0]
    expect(pipeline.find((s: any) => s.$match?.['blocker.status'])).toEqual({ $match: { 'blocker.status': { $ne: 'complete' } } })
    expect(JSON.stringify(pipeline)).toContain('"status":{"$ne":"complete"}')
  })

  it('uses a fixed number of queries however many projects there are', async () => {
    as(ADMIN, 'admin')
    await call()
    expect(m.taskAggregate).toHaveBeenCalledTimes(3)
    expect(m.depAggregate).toHaveBeenCalledTimes(1)
    expect(m.projectFind).toHaveBeenCalledTimes(1)
  })
})

describe('time zone', () => {
  it('buckets by the viewer zone and reads the range as that zone\'s local days', async () => {
    as(LEADER)
    await call('&timeZone=Asia/Karachi&from=2026-10-01&to=2026-10-07')
    const periodPipeline = m.taskAggregate.mock.calls.map(([p]) => p).find((p) => kind(p) === 'period')!
    const { created, completed } = periodPipeline[1].$facet
    // The grouped value is a field PATH ($createdAt), not the literal text "createdAt".
    expect(created[1].$group._id.$dateToString.date).toBe('$createdAt')
    expect(completed[1].$group._id.$dateToString.date).toBe('$completedAt')
    expect(created[1].$group._id.$dateToString.timezone).toBe('Asia/Karachi')
    expect(completed[1].$group._id.$dateToString.timezone).toBe('Asia/Karachi')
    expect(created[0].$match.createdAt).toEqual({
      $gte: new Date('2026-09-30T19:00:00Z'),
      $lt: new Date('2026-10-07T19:00:00Z'),
    })
    // The pre-filter that decides which tasks are looked at uses the same instants.
    expect(periodPipeline[0].$match.$or[0].createdAt.$gte).toEqual(new Date('2026-09-30T19:00:00Z'))
  })

  it('reports the zone it used, and defaults to UTC', async () => {
    as(LEADER)
    expect((await (await call('&timeZone=America/New_York')).json()).range.timeZone).toBe('America/New_York')
    expect((await (await call()).json()).range.timeZone).toBe('UTC')
  })

  it.each(['&timeZone=Mars/Base', '&timeZone=%7B%22%24ne%22%3A1%7D', '&timeZone=../x'])('rejects %s with 400 and reads nothing', async (q) => {
    as(LEADER)
    expect((await call(q)).status).toBe(400)
    expect(m.taskAggregate).not.toHaveBeenCalled()
  })

  it('does not change what overdue means: it still follows the viewer\'s today, not their time zone', async () => {
    as(LEADER)
    await call('&timeZone=Asia/Karachi')
    const snapshotPipeline = m.taskAggregate.mock.calls.map(([p]) => p).find((p) => kind(p) === 'snapshot')!
    const age = snapshotPipeline[1].$group._id.age.$cond[0].$and
    expect(age[2].$lt[1]).toEqual(new Date(`${TODAY}T00:00:00Z`))
  })
})

describe('developers (who carries what)', () => {
  const grp = (assignee: string, status: string, count: number, overdue = false) => ({ _id: { assignee, status, priority: 'medium', overdue }, count })

  it('lists each roster member with Team Workload\'s counts and band, A–Z, and no scores', async () => {
    as(LEADER)
    byAssignee = [grp(BEN, 'in-progress', 2), grp(BEN, 'complete', 5), grp(ANA, 'todo', 7, true)]
    const body = await (await call()).json()
    expect(body.developers.map((d: any) => d.name)).toEqual(['Ana', 'Ben'])
    expect(body.developers[0]).toMatchObject({ _id: ANA, teamId: TEAM, activeTasks: 7, overdue: 7, workloadStatus: 'overloaded' })
    expect(body.developers[1]).toMatchObject({ _id: BEN, activeTasks: 2, completed: 5, totalTasks: 7, workloadStatus: 'normal' })
    expect(JSON.stringify(body.developers)).not.toMatch(/score|rank|email/i)
  })

  it('a leader never sees developers of a team they do not lead; an admin sees all', async () => {
    as(LEADER)
    expect(JSON.stringify((await (await call()).json()).developers)).not.toContain('Zed')
    as(ADMIN, 'admin')
    expect((await (await call()).json()).developers.map((d: any) => d.name)).toEqual(['Ana', 'Ben', 'Zed'])
  })

  it('people with no tasks are still listed as Available', async () => {
    as(LEADER)
    const body = await (await call()).json()
    expect(body.developers.every((d: any) => d.workloadStatus === 'available' && d.totalTasks === 0)).toBe(true)
  })
})
