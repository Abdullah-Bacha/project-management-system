import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Search and filters on the two task lists, at the route level. The real
 * authorization guard runs (only the database and the caller are stubbed), so
 * these also show that search can only narrow what a caller may already see.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    projectFindById: vi.fn(),
    projectFind: vi.fn(),
    teamExists: vi.fn(),
    taskFind: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Task: { find: m.taskFind },
  Project: { findById: m.projectFindById, find: m.projectFind },
  Team: { exists: m.teamExists },
}))

import { GET as projectTasks } from './projects/[id]/tasks/route'
import { GET as myTasks } from './tasks/mine/route'

const id = (c: string) => c.repeat(24)
const LEADER = id('b')
const DEV = id('c')
const TEAMMATE = id('d')
const OUTSIDER = id('e')
const PROJECT = id('2')
const project = { _id: PROJECT, title: 'P', owner: id('a'), team: id('3'), members: [id('a'), LEADER, DEV, TEAMMATE] }

const chain = (value: unknown) => {
  const q: any = {}
  for (const step of ['populate', 'sort', 'select', 'limit']) q[step] = () => q
  q.lean = () => Promise.resolve(value)
  q.then = (ok: any) => ok(value)
  return q
}

const as = (userId: string | null, { leader = false } = {}) => {
  m.authenticate.mockResolvedValue(userId ? { user: { userId, role: 'developer' }, error: null } : { user: null, error: 'Unauthorized' })
  m.teamExists.mockResolvedValue(leader ? { _id: id('3') } : null)
}

const list = (query = '') =>
  projectTasks(new NextRequest(`http://localhost/api/projects/${PROJECT}/tasks${query}`), { params: Promise.resolve({ id: PROJECT }) })
const mine = (query = '') => myTasks(new NextRequest(`http://localhost/api/tasks/mine${query}`))
const lastFilter = () => m.taskFind.mock.calls.at(-1)![0]

beforeEach(() => {
  vi.resetAllMocks()
  m.projectFindById.mockReturnValue(chain(project))
  m.projectFind.mockReturnValue(chain([{ _id: PROJECT, title: 'P' }, { _id: id('7'), title: 'Other' }]))
  m.taskFind.mockReturnValue(chain([]))
})

describe('project task list: who can ask', () => {
  it('signed-out callers get 401', async () => {
    as(null)
    expect((await list('?q=login')).status).toBe(401)
    expect(m.taskFind).not.toHaveBeenCalled()
  })

  it('a non-member gets the existing 404, search or not', async () => {
    as(OUTSIDER)
    expect((await list('?q=login')).status).toBe(404)
    expect(m.taskFind).not.toHaveBeenCalled()
  })
})

describe('project task list: filters', () => {
  it('no filters behaves as before: the project, plus the developer restriction', async () => {
    as(LEADER, { leader: true })
    await list()
    expect(lastFilter()).toEqual({ projectId: PROJECT })

    as(DEV)
    await list()
    expect(lastFilter()).toEqual({ projectId: PROJECT, assignedTo: DEV })
  })

  it('searches title and description, case-insensitively', async () => {
    as(LEADER, { leader: true })
    await list('?q=Login')
    const { $or } = lastFilter()
    expect($or).toHaveLength(2)
    expect($or[0].title.test('build the LOGIN page')).toBe(true)
    expect($or[1].description.test('uses login')).toBe(true)
  })

  it('status, developer and creator filters', async () => {
    as(LEADER, { leader: true })
    await list('?status=review')
    expect(lastFilter()).toEqual({ projectId: PROJECT, status: 'review' })
    await list(`?assigneeId=${DEV}`)
    expect(lastFilter()).toEqual({ projectId: PROJECT, assignedTo: DEV })
    await list(`?createdBy=${LEADER}`)
    expect(lastFilter()).toEqual({ projectId: PROJECT, createdBy: LEADER })
  })

  it('search, status and developer together are all required (AND)', async () => {
    as(LEADER, { leader: true })
    await list(`?q=login&status=review&assigneeId=${DEV}`)
    const filter = lastFilter()
    const parts = filter.$and as Record<string, unknown>[]
    expect(filter.projectId).toBe(PROJECT)
    expect(parts).toEqual(
      expect.arrayContaining([expect.objectContaining({ assignedTo: DEV }), expect.objectContaining({ $or: expect.any(Array) }), { status: 'review' }])
    )
  })

  it('trims the search text', async () => {
    as(LEADER, { leader: true })
    await list('?q=%20%20login%20%20')
    expect(lastFilter().$or[0].title.source).toBe('login')
  })
})

describe('project task list: a developer can only narrow their own tasks', () => {
  it('their own search keeps the restriction to their tasks', async () => {
    as(DEV)
    await list('?q=login')
    const filter = lastFilter()
    expect(filter.$and).toEqual(expect.arrayContaining([{ assignedTo: DEV }]))
  })

  it('asking for a teammate adds a second condition; it can never replace the restriction', async () => {
    as(DEV)
    await list(`?assigneeId=${TEAMMATE}`)
    // assignedTo = me AND assignedTo = teammate: nothing can satisfy both.
    expect(lastFilter().$and).toEqual([{ assignedTo: DEV }, { assignedTo: TEAMMATE }])
  })

  it('a creator filter is still inside the same restriction', async () => {
    as(DEV)
    await list(`?createdBy=${LEADER}`)
    expect(lastFilter().$and).toEqual([{ assignedTo: DEV }, { createdBy: LEADER }])
  })
})

describe('validation', () => {
  beforeEach(() => as(LEADER, { leader: true }))

  it.each([
    ['status', '?status=done'],
    ['priority', '?priority=huge'],
    ['assignee id', '?assigneeId=nope'],
    ['assignee id as an operator', '?assigneeId=$ne'],
    ['creator id', '?createdBy=123'],
    ['an overlong search', `?q=${'x'.repeat(101)}`],
  ])('rejects an invalid %s with 400 and queries nothing', async (_name, query) => {
    const res = await list(query)
    expect(res.status).toBe(400)
    expect(m.taskFind).not.toHaveBeenCalled()
  })
})

describe('My Tasks (cross-project)', () => {
  it('signed-out callers get 401', async () => {
    as(null)
    expect((await mine('?q=x')).status).toBe(401)
  })

  it('always restricts to the caller and applies search, status and project in the database', async () => {
    as(DEV)
    await mine(`?q=login&status=review&projectId=${PROJECT}&include=all&limit=5`)
    // The caller restriction and the search are separate parts, ANDed together.
    const parts = (lastFilter().$and ?? [lastFilter()]) as Record<string, any>[]
    const base = parts.find((p) => p.assignedTo)!
    expect(base.assignedTo).toBe(DEV)
    expect(base.status).toBe('review')
    expect(base.projectId.$in).toEqual([PROJECT])
    expect(parts.find((p) => p.$or)!.$or).toHaveLength(2)
  })

  it('a project filter cannot reach a project the caller does not belong to', async () => {
    as(DEV)
    await mine(`?projectId=${id('9')}`)
    expect(lastFilter().projectId.$in).toEqual([])
  })

  it('no filters leaves the original query alone', async () => {
    as(DEV)
    await mine()
    const filter = lastFilter()
    expect(Object.keys(filter).sort()).toEqual(['assignedTo', 'projectId'])
  })

  it.each([['status', '?status=done'], ['project id', '?projectId=nope'], ['search length', `?q=${'x'.repeat(101)}`]])(
    'rejects an invalid %s with 400',
    async (_name, query) => {
      as(DEV)
      expect((await mine(query)).status).toBe(400)
      expect(m.taskFind).not.toHaveBeenCalled()
    }
  )

  it('still honours the page size when filtering', async () => {
    as(DEV)
    m.taskFind.mockReturnValue(
      chain(Array.from({ length: 10 }, (_, i) => ({ _id: id(String(i)), title: `Login ${i}`, status: 'todo', priority: 'low', projectId: PROJECT })))
    )
    const body = await (await mine('?q=login&limit=3')).json()
    expect(body.tasks).toHaveLength(3)
    expect(body.total).toBe(10)
  })
})
