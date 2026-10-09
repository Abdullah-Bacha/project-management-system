import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { buildDeveloperRows, type TaskGroup } from '@/lib/services/workload'

/**
 * Team workload at the route level. Only the database and the caller are
 * stubbed, so the real scope rules and counting run.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return { authenticate: vi.fn(), teamFind: vi.fn(), projectFind: vi.fn(), taskAggregate: vi.fn() }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Team: { find: m.teamFind },
  Project: { find: m.projectFind },
  Task: { aggregate: m.taskAggregate },
}))

import { GET } from './workload/route'

const id = (c: string) => c.repeat(24)
const LEADER = id('b')
const ADMIN = id('a')
const TEAM = id('3')
const OTHER_TEAM = id('4')
const PROJECT = id('2')
const OTHER_PROJECT = id('5')
const ANA = id('c')
const BEN = id('d')

const chain = (value: unknown) => {
  const q: any = {}
  for (const step of ['populate', 'sort', 'select', 'limit']) q[step] = () => q
  q.lean = () => Promise.resolve(value)
  return q
}

const as = (userId: string | null, role = 'team_leader') =>
  m.authenticate.mockResolvedValue(userId ? { user: { userId, role }, error: null } : { user: null, error: 'Unauthorized' })

const call = (query = '') => GET(new NextRequest(`http://localhost/api/workload${query}`))
const group = (assignee: string, status: string, count: number, extra: Record<string, unknown> = {}): TaskGroup =>
  ({ _id: { assignee, status, priority: 'medium', overdue: false, ...extra }, count }) as TaskGroup

beforeEach(() => {
  vi.resetAllMocks()
  // Team.find is used twice: the teams in scope (by leader / all), then their rosters (by _id).
  m.teamFind.mockImplementation((filter: any) =>
    chain(
      filter?._id
        ? [
            { _id: TEAM, name: 'Alpha', members: [{ _id: ANA, name: 'Ana' }, { _id: BEN, name: 'Ben' }] },
            { _id: OTHER_TEAM, name: 'Beta', members: [{ _id: id('9'), name: 'Zed' }] },
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
  m.taskAggregate.mockResolvedValue([])
})

describe('who can ask', () => {
  it('signed-out callers get 401 and nothing is read', async () => {
    as(null)
    expect((await call()).status).toBe(401)
    expect(m.teamFind).not.toHaveBeenCalled()
  })

  it('developers get 403 and no data', async () => {
    as(ANA, 'developer')
    const res = await call()
    expect(res.status).toBe(403)
    expect(m.taskAggregate).not.toHaveBeenCalled()
    expect(JSON.stringify(await res.json())).not.toContain('Ana')
  })
})

describe('scope', () => {
  it('a team leader is limited to the teams they lead and projects they manage', async () => {
    as(LEADER)
    const res = await call()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.teams).toEqual([{ _id: TEAM, name: 'Alpha' }])
    expect(body.projects.map((p: any) => p._id)).toEqual([PROJECT])
    expect(body.developers.map((d: any) => d.name)).toEqual(['Ana', 'Ben'])
    expect(m.teamFind.mock.calls[0][0]).toEqual({ teamLeader: LEADER })
  })

  it('the aggregation is confined to the scoped projects and the roster', async () => {
    as(LEADER)
    await call()
    const match = m.taskAggregate.mock.calls[0][0][0].$match
    expect(match.projectId.$in).toEqual([PROJECT])
    expect(match.assignedTo.$in.map(String).sort()).toEqual([ANA, BEN].sort())
  })

  it('an administrator sees every team and project', async () => {
    as(ADMIN, 'admin')
    const body = await (await call()).json()
    expect(body.teams.map((t: any) => t.name)).toEqual(['Alpha', 'Beta'])
    expect(body.projects).toHaveLength(2)
    expect(body.developers.map((d: any) => d.name)).toEqual(['Ana', 'Ben', 'Zed'])
  })

  it('a team or project outside a leader scope is a 404', async () => {
    as(LEADER)
    expect((await call(`?teamId=${OTHER_TEAM}`)).status).toBe(404)
    expect((await call(`?projectId=${OTHER_PROJECT}`)).status).toBe(404)
  })
})

describe('validation', () => {
  it.each(['?teamId=abc', '?projectId=%7B%22%24ne%22%3Anull%7D', '?workload=busy', '?today=2026-02-30'])(
    'rejects %s',
    async (q) => {
      as(LEADER)
      const res = await call(q)
      expect(res.status).toBe(400)
      expect(m.taskAggregate).not.toHaveBeenCalled()
    }
  )
})

describe('operators', () => {
  it('operator-style keys are ignored, never passed into a query', async () => {
    as(LEADER)
    const res = await call('?teamId[$ne]=x&projectId[$gt]=')
    expect(res.status).toBe(200)
    expect(JSON.stringify(m.taskAggregate.mock.calls[0][0])).not.toContain('$ne')
  })
})

describe('filters', () => {
  it('a team filter limits the roster to that team', async () => {
    as(ADMIN, 'admin')
    const body = await (await call(`?teamId=${OTHER_TEAM}`)).json()
    expect(body.developers.map((d: any) => d.name)).toEqual(['Zed'])
    expect(m.taskAggregate.mock.calls[0][0][0].$match.projectId.$in).toEqual([OTHER_PROJECT])
  })

  it('a project filter counts only that project tasks and uses its team roster', async () => {
    as(ADMIN, 'admin')
    m.taskAggregate.mockResolvedValue([])
    const body = await (await call(`?projectId=${OTHER_PROJECT}`)).json()
    expect(body.developers.map((d: any) => d.name)).toEqual(['Zed'])
    expect(m.taskAggregate.mock.calls[0][0][0].$match.projectId.$in).toEqual([OTHER_PROJECT])
  })

  it('a team and a project that do not belong together count nothing (no query)', async () => {
    as(ADMIN, 'admin')
    const body = await (await call(`?teamId=${TEAM}&projectId=${OTHER_PROJECT}`)).json()
    expect(body.developers.map((d: any) => d.name)).toEqual(['Ana', 'Ben'])
    expect(m.taskAggregate).not.toHaveBeenCalled()
  })

  it('the workload filter narrows developers and the summary follows', async () => {
    as(LEADER)
    m.taskAggregate.mockResolvedValue([group(ANA, 'todo', 5), group(BEN, 'todo', 1)])
    const body = await (await call('?workload=high')).json()
    expect(body.developers.map((d: any) => d.name)).toEqual(['Ana'])
    expect(body.summary).toEqual({ members: 1, activeTasks: 5, inReview: 0, overdue: 0 })
  })

  it('combined team + project + workload', async () => {
    as(LEADER)
    m.taskAggregate.mockResolvedValue([group(ANA, 'todo', 7), group(BEN, 'review', 2)])
    const body = await (await call(`?teamId=${TEAM}&projectId=${PROJECT}&workload=overloaded`)).json()
    expect(body.developers.map((d: any) => [d.name, d.workloadStatus])).toEqual([['Ana', 'overloaded']])
  })

  it('uses the viewer date for overdue', async () => {
    as(LEADER)
    await call('?today=2026-10-08')
    const overdue = m.taskAggregate.mock.calls[0][0][1].$group._id.overdue
    expect(overdue.$and[1].$lt[1]).toEqual(new Date('2026-10-08T00:00:00Z'))
  })
})

describe('counting', () => {
  const roster = [
    { id: ANA, name: 'Ana', teamId: TEAM },
    { id: BEN, name: 'Ben', teamId: TEAM },
  ]

  it('active is To Do + In Progress + In Review; Complete is never active', () => {
    const [ana] = buildDeveloperRows(roster, [
      group(ANA, 'todo', 2),
      group(ANA, 'in-progress', 1),
      group(ANA, 'review', 3),
      group(ANA, 'complete', 4),
    ])
    expect(ana).toMatchObject({ todo: 2, inProgress: 1, inReview: 3, completed: 4, activeTasks: 6, totalTasks: 10, workloadStatus: 'high' })
  })

  it('overdue counts open late tasks only; completed and undated tasks are not overdue', () => {
    const [ana] = buildDeveloperRows(roster, [
      group(ANA, 'todo', 2, { overdue: true }),
      group(ANA, 'complete', 5, { overdue: true }),
      group(ANA, 'todo', 3, { overdue: false }),
    ])
    expect(ana.overdue).toBe(2)
  })

  it('high and urgent are counted among active tasks', () => {
    const [ana] = buildDeveloperRows(roster, [
      group(ANA, 'todo', 2, { priority: 'high' }),
      group(ANA, 'review', 1, { priority: 'urgent' }),
      group(ANA, 'complete', 4, { priority: 'urgent' }),
      group(ANA, 'todo', 1, { priority: 'low' }),
    ])
    expect(ana).toMatchObject({ high: 2, urgent: 1 })
  })

  it('a roster member with no tasks is Available, and assignees outside the roster are ignored', () => {
    const rows = buildDeveloperRows(roster, [group(id('f'), 'todo', 9)])
    expect(rows.map((r) => [r.name, r.activeTasks, r.workloadStatus])).toEqual([
      ['Ana', 0, 'available'],
      ['Ben', 0, 'available'],
    ])
  })
})
