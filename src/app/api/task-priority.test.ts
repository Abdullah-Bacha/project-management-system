import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Task priority at the route level: set when a task is created, changed by an
 * authorized user, validated, filtered, and independent of the workflow. The
 * real authorization guards run; only the database and the caller are stubbed.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    taskFindById: vi.fn(),
    taskFind: vi.fn(),
    taskCreate: vi.fn(),
    taskCount: vi.fn(),
    taskUpdate: vi.fn(),
    projectFindById: vi.fn(),
    projectFind: vi.fn(),
    teamExists: vi.fn(),
    userExists: vi.fn(),
    syncProjectProgress: vi.fn(),
    emit: vi.fn(),
    record: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Task: {
    findById: m.taskFindById,
    find: m.taskFind,
    create: m.taskCreate,
    countDocuments: m.taskCount,
    findByIdAndUpdate: m.taskUpdate,
  },
  Project: { findById: m.projectFindById, find: m.projectFind },
  Team: { exists: m.teamExists, findById: vi.fn() },
  User: { exists: m.userExists },
  TaskDependency: { find: () => ({ select: () => ({ lean: () => Promise.resolve([]) }) }) },
}))
vi.mock('@/lib/services/notifications', () => ({ emitNotification: m.emit, actorName: vi.fn().mockResolvedValue('Someone') }))
vi.mock('@/lib/services/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/projects')>()),
  syncProjectProgress: m.syncProjectProgress,
}))
vi.mock('@/lib/services/activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/activity')>()),
  recordActivity: m.record,
}))

import { GET as listTasks, POST as createTask } from './projects/[id]/tasks/route'
import { PUT as editTask } from './tasks/[id]/route'
import { GET as myTasks } from './tasks/mine/route'

const id = (c: string) => c.repeat(24)
const LEADER = id('b')
const DEV = id('c')
const TEAMMATE = id('d')
const TASK = id('1')
const PROJECT = id('2')
const project = { _id: PROJECT, title: 'P', owner: id('a'), team: id('3'), members: [id('a'), LEADER, DEV, TEAMMATE] }
const task = { _id: TASK, title: 'Fix bug', projectId: PROJECT, status: 'in-progress', priority: 'medium', assignedTo: DEV, createdBy: LEADER }

const chain = (value: unknown) => {
  const q: any = {}
  for (const step of ['populate', 'sort', 'select', 'limit']) q[step] = () => q
  q.lean = () => Promise.resolve(value)
  q.then = (ok: any) => ok(value)
  return q
}
const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const params = (value: string) => ({ params: Promise.resolve({ id: value }) })

const as = (userId: string, { leader = false } = {}) => {
  m.authenticate.mockResolvedValue({ user: { userId, role: 'developer' }, error: null })
  m.teamExists.mockResolvedValue(leader ? { _id: id('3') } : null)
}

beforeEach(() => {
  vi.resetAllMocks()
  m.projectFindById.mockReturnValue(chain(project))
  m.projectFind.mockReturnValue(chain([{ _id: PROJECT, title: 'P' }]))
  m.taskFindById.mockImplementation(() => chain(task))
  m.taskFind.mockReturnValue(chain([]))
  m.taskCount.mockResolvedValue(0)
  m.userExists.mockResolvedValue({ _id: DEV })
  m.taskCreate.mockImplementation(async (doc: any) => ({ ...doc, _id: TASK, populate: vi.fn() }))
  m.taskUpdate.mockImplementation((_id: string, update: any) => chain({ ...task, ...update }))
})

describe('creating a task', () => {
  const create = (body: Record<string, unknown>) =>
    createTask(json(`/api/projects/${PROJECT}/tasks`, 'POST', { title: 'Fix bug', ...body }), params(PROJECT))

  beforeEach(() => as(LEADER, { leader: true }))

  it('defaults to medium when no priority is given', async () => {
    expect((await create({})).status).toBe(201)
    expect(m.taskCreate.mock.calls[0][0].priority).toBe('medium')
  })

  it.each(['low', 'medium', 'high', 'urgent'])('accepts %s', async (priority) => {
    expect((await create({ priority })).status).toBe(201)
    expect(m.taskCreate.mock.calls[0][0].priority).toBe(priority)
  })

  it.each(['critical', 'CRITICAL', 'SUPER_HIGH', '$ne', 'HIGH', ''])('rejects %j and creates nothing', async (priority) => {
    expect((await create({ priority })).status).toBe(400)
    expect(m.taskCreate).not.toHaveBeenCalled()
  })

  it('rejects an operator object in place of a value', async () => {
    expect((await create({ priority: { $ne: 'low' } })).status).toBe(400)
    expect(m.taskCreate).not.toHaveBeenCalled()
  })
})

describe('changing a task’s priority', () => {
  const edit = (body: Record<string, unknown>) => editTask(json(`/api/tasks/${TASK}`, 'PUT', body), params(TASK))

  it('the team leader can change it', async () => {
    as(LEADER, { leader: true })
    const res = await edit({ priority: 'urgent' })
    expect(res.status).toBe(200)
    expect((await res.json()).task.priority).toBe('urgent')
    expect(m.taskUpdate.mock.calls[0][1].priority).toBe('urgent')
  })

  it('it is only metadata: no status change, progress, notification or activity', async () => {
    as(LEADER, { leader: true })
    await edit({ priority: 'high' })
    const update = m.taskUpdate.mock.calls[0][1]
    expect(update.status).toBeUndefined()
    expect(update.$set).toBeUndefined()
    expect(m.syncProjectProgress).not.toHaveBeenCalled()
    expect(m.emit).not.toHaveBeenCalled()
    expect(m.record).not.toHaveBeenCalled()
  })

  it('the assigned developer cannot change it (403), and nothing is written', async () => {
    as(DEV)
    expect((await edit({ priority: 'low' })).status).toBe(403)
    expect(m.taskUpdate).not.toHaveBeenCalled()
  })

  it('another developer cannot change it either', async () => {
    as(TEAMMATE)
    expect((await edit({ priority: 'low' })).status).toBe(403)
    expect(m.taskUpdate).not.toHaveBeenCalled()
  })

  it.each(['critical', '$ne', 'URGENT'])('rejects %j', async (priority) => {
    as(LEADER, { leader: true })
    expect((await edit({ priority })).status).toBe(400)
    expect(m.taskUpdate).not.toHaveBeenCalled()
  })
})

describe('reading and filtering by priority', () => {
  const list = (query = '') =>
    listTasks(new NextRequest(`http://localhost/api/projects/${PROJECT}/tasks${query}`), params(PROJECT))
  const lastFilter = () => m.taskFind.mock.calls.at(-1)![0]

  it('a task comes back with its priority', async () => {
    as(LEADER, { leader: true })
    m.taskFind.mockReturnValue(chain([{ ...task, priority: 'high' }]))
    const body = await (await list()).json()
    expect(body.tasks[0].priority).toBe('high')
  })

  it('the leader filter returns only that priority, decided by the database', async () => {
    as(LEADER, { leader: true })
    await list('?priority=high')
    expect(lastFilter()).toEqual({ projectId: PROJECT, priority: 'high' })
  })

  it('a developer’s priority filter stays inside their own tasks', async () => {
    as(DEV)
    await list('?priority=urgent&q=bug')
    const parts = lastFilter().$and as Record<string, unknown>[]
    expect(parts).toEqual(expect.arrayContaining([{ assignedTo: DEV }, { priority: 'urgent' }]))
  })

  it('priority combines with status and a developer (AND)', async () => {
    as(LEADER, { leader: true })
    await list(`?priority=high&status=review&assigneeId=${DEV}`)
    const parts = lastFilter().$and as Record<string, unknown>[]
    expect(parts).toEqual(expect.arrayContaining([{ assignedTo: DEV }, expect.objectContaining({ priority: 'high', status: 'review' })]))
  })

  it.each(['?priority=critical', '?priority=$ne', '?priority=HIGH'])('rejects %s with 400', async (query) => {
    as(LEADER, { leader: true })
    expect((await list(query)).status).toBe(400)
    expect(m.taskFind).not.toHaveBeenCalled()
  })

  it('My Tasks filters by priority inside the caller’s own tasks', async () => {
    as(DEV)
    await myTasks(new NextRequest('http://localhost/api/tasks/mine?priority=urgent'))
    const filter = lastFilter()
    expect(filter.assignedTo).toBe(DEV)
    expect(filter.priority).toBe('urgent')
  })

  it('My Tasks rejects an unknown priority', async () => {
    as(DEV)
    expect((await myTasks(new NextRequest('http://localhost/api/tasks/mine?priority=critical'))).status).toBe(400)
    expect(m.taskFind).not.toHaveBeenCalled()
  })
})
