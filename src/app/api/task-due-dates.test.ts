import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Due dates at the route level: setting, changing and removing them, keeping
 * them out of the workflow, and filtering by deadline inside a caller's own
 * access. The real authorization guards run; only the database and the caller
 * are stubbed.
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
    teamFindById: vi.fn(),
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
  Team: { exists: m.teamExists, findById: m.teamFindById },
  User: { exists: m.userExists },
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
import { PUT as setStatus } from './tasks/[id]/status/route'
import { GET as myTasks } from './tasks/mine/route'

const id = (c: string) => c.repeat(24)
const LEADER = id('b')
const DEV = id('c')
const TEAMMATE = id('d')
const OUTSIDER = id('e')
const TASK = id('1')
const PROJECT = id('2')
const project = { _id: PROJECT, title: 'P', owner: id('a'), team: id('3'), members: [id('a'), LEADER, DEV, TEAMMATE] }
const DUE = new Date('2026-10-12T00:00:00Z')
const baseTask = { _id: TASK, title: 'Fix bug', projectId: PROJECT, status: 'in-progress', priority: 'medium', assignedTo: DEV, createdBy: LEADER, dueDate: DUE }

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

const as = (userId: string | null, { leader = false } = {}) => {
  m.authenticate.mockResolvedValue(userId ? { user: { userId, role: 'developer' }, error: null } : { user: null, error: 'Unauthorized' })
  m.teamExists.mockResolvedValue(leader ? { _id: id('3') } : null)
}

let current = baseTask
beforeEach(() => {
  vi.resetAllMocks()
  current = baseTask
  m.projectFindById.mockReturnValue(chain(project))
  m.projectFind.mockReturnValue(chain([{ _id: PROJECT, title: 'P' }]))
  m.taskFindById.mockImplementation(() => chain(current))
  m.taskFind.mockReturnValue(chain([]))
  m.taskCount.mockResolvedValue(0)
  m.userExists.mockResolvedValue({ _id: DEV })
  m.teamFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ teamLeader: LEADER }) }) })
  m.taskCreate.mockImplementation(async (doc: any) => ({ ...doc, _id: TASK, populate: vi.fn() }))
  m.taskUpdate.mockImplementation((_id: string, update: any) => chain({ ...current, ...(update.$set ?? update) }))
})

describe('creating a task', () => {
  const create = (body: Record<string, unknown>) =>
    createTask(json(`/api/projects/${PROJECT}/tasks`, 'POST', { title: 'Fix bug', ...body }), params(PROJECT))
  beforeEach(() => as(LEADER, { leader: true }))

  it('without a due date: no date is stored', async () => {
    expect((await create({})).status).toBe(201)
    expect(m.taskCreate.mock.calls[0][0].dueDate).toBeUndefined()
  })

  it('with a valid date: stored as that day at 00:00 UTC', async () => {
    expect((await create({ dueDate: '2026-10-12' })).status).toBe(201)
    expect(m.taskCreate.mock.calls[0][0].dueDate).toEqual(DUE)
  })

  it('a date in the past is allowed', async () => {
    expect((await create({ dueDate: '2020-01-01' })).status).toBe(201)
  })

  it.each(['tomorrow', '2026-02-30', '12/10/2026', '2026-13-40', '$ne', ''])('rejects %j and creates nothing', async (dueDate) => {
    expect((await create({ dueDate })).status).toBe(400)
    expect(m.taskCreate).not.toHaveBeenCalled()
  })

  it('rejects a non-string', async () => {
    expect((await create({ dueDate: { $ne: null } })).status).toBe(400)
    expect((await create({ dueDate: 20261012 })).status).toBe(400)
  })
})

describe('editing a due date', () => {
  const edit = (body: Record<string, unknown>) => editTask(json(`/api/tasks/${TASK}`, 'PUT', body), params(TASK))

  it('the team leader can set one on a task that had none', async () => {
    current = { ...baseTask, dueDate: undefined as any }
    as(LEADER, { leader: true })
    expect((await edit({ dueDate: '2026-11-01' })).status).toBe(200)
    expect(m.taskUpdate.mock.calls[0][1].dueDate).toEqual(new Date('2026-11-01T00:00:00Z'))
  })

  it('can change it, including to a past day', async () => {
    as(LEADER, { leader: true })
    expect((await edit({ dueDate: '2026-12-25' })).status).toBe(200)
    expect((await edit({ dueDate: '2020-01-01' })).status).toBe(200)
  })

  it('can remove it', async () => {
    as(LEADER, { leader: true })
    expect((await edit({ dueDate: null })).status).toBe(200)
    expect(m.taskUpdate.mock.calls[0][1].$unset).toEqual({ dueDate: '' })
  })

  it('an invalid date is refused and nothing is written', async () => {
    as(LEADER, { leader: true })
    expect((await edit({ dueDate: 'next week' })).status).toBe(400)
    expect((await edit({ dueDate: '2026-02-30' })).status).toBe(400)
    expect(m.taskUpdate).not.toHaveBeenCalled()
  })

  it('the assigned developer cannot change it (403)', async () => {
    as(DEV)
    expect((await edit({ dueDate: '2030-01-01' })).status).toBe(403)
    expect(m.taskUpdate).not.toHaveBeenCalled()
  })

  it('another developer cannot either', async () => {
    as(TEAMMATE)
    expect((await edit({ dueDate: null })).status).toBe(403)
    expect(m.taskUpdate).not.toHaveBeenCalled()
  })

  it('is only metadata: no status change, progress, notification or activity', async () => {
    as(LEADER, { leader: true })
    await edit({ dueDate: '2026-12-25' })
    expect(m.taskUpdate.mock.calls[0][1].status).toBeUndefined()
    expect(m.syncProjectProgress).not.toHaveBeenCalled()
    expect(m.emit).not.toHaveBeenCalled()
    expect(m.record).not.toHaveBeenCalled()
  })
})

describe('the workflow never touches the due date', () => {
  const move = (status: string) => setStatus(json(`/api/tasks/${TASK}/status`, 'PUT', { status }), params(TASK))

  it.each([
    ['developer', 'todo', 'in-progress'],
    ['developer', 'in-progress', 'review'],
    ['leader', 'review', 'in-progress'],
    ['leader', 'review', 'complete'],
    ['leader', 'complete', 'in-progress'],
  ])('%s moving %s → %s leaves it alone', async (who, from, to) => {
    current = { ...baseTask, status: from }
    who === 'leader' ? as(LEADER, { leader: true }) : as(DEV)
    expect((await move(to)).status).toBe(200)

    const update = m.taskUpdate.mock.calls[0][1]
    expect(update.$set).not.toHaveProperty('dueDate')
    expect(update.$unset ?? {}).not.toHaveProperty('dueDate')
  })
})

describe('filtering by deadline', () => {
  const list = (query = '') =>
    listTasks(new NextRequest(`http://localhost/api/projects/${PROJECT}/tasks${query}`), params(PROJECT))
  const lastFilter = () => m.taskFind.mock.calls.at(-1)![0]
  const START = new Date('2026-10-10T00:00:00Z')
  const NEXT = new Date('2026-10-11T00:00:00Z')

  it('overdue, today, upcoming and none use the viewer’s date', async () => {
    as(LEADER, { leader: true })
    await list('?due=overdue&today=2026-10-10')
    expect(lastFilter()).toEqual({ projectId: PROJECT, dueDate: { $lt: START }, status: { $ne: 'complete' } })
    await list('?due=today&today=2026-10-10')
    expect(lastFilter().dueDate).toEqual({ $gte: START, $lt: NEXT })
    await list('?due=upcoming&today=2026-10-10')
    expect(lastFilter().dueDate).toEqual({ $gte: NEXT })
    await list('?due=none')
    expect(lastFilter()).toEqual({ projectId: PROJECT, dueDate: null })
  })

  it('combines with status, priority, developer, creator and search (all must hold)', async () => {
    as(LEADER, { leader: true })
    await list(`?due=overdue&today=2026-10-10&status=review&priority=high&assigneeId=${DEV}&createdBy=${LEADER}&q=bug`)
    const parts = lastFilter().$and as Record<string, any>[]
    const merged = Object.assign({}, ...parts)
    expect(merged.assignedTo).toBe(DEV)
    expect(merged.createdBy).toBe(LEADER)
    expect(merged.$or).toHaveLength(2)
    expect(parts).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'review', priority: 'high' })]))
    expect(parts).toEqual(expect.arrayContaining([expect.objectContaining({ dueDate: { $lt: START } })]))
  })

  it('a developer’s due filter stays inside their own tasks', async () => {
    as(DEV)
    await list('?due=overdue&today=2026-10-10')
    const parts = lastFilter().$and as Record<string, unknown>[]
    expect(parts).toEqual(expect.arrayContaining([{ assignedTo: DEV }]))
    expect(parts).toEqual(expect.arrayContaining([expect.objectContaining({ dueDate: { $lt: START } })]))
  })

  it('a developer asking for a teammate still cannot get them', async () => {
    as(DEV)
    await list(`?due=none&assigneeId=${TEAMMATE}`)
    // assignedTo = me AND (assignedTo = teammate AND no due date): nothing can satisfy both.
    expect(lastFilter().$and).toEqual([{ assignedTo: DEV }, { dueDate: null, assignedTo: TEAMMATE }])
  })

  it.each(['?due=soon', '?due=$ne', '?due=overdue&today=2026-02-30', '?due=overdue&today=today', '?today=10/10/2026'])(
    'rejects %s with 400',
    async (query) => {
      as(LEADER, { leader: true })
      expect((await list(query)).status).toBe(400)
      expect(m.taskFind).not.toHaveBeenCalled()
    }
  )

  it('signed-out callers get 401 and non-members the existing 404', async () => {
    as(null)
    expect((await list('?due=overdue')).status).toBe(401)
    as(OUTSIDER)
    expect((await list('?due=overdue')).status).toBe(404)
    expect(m.taskFind).not.toHaveBeenCalled()
  })

  it('My Tasks: the due filter is applied inside the caller’s own tasks', async () => {
    as(DEV)
    await myTasks(new NextRequest('http://localhost/api/tasks/mine?due=overdue&today=2026-10-10'))
    const parts = (lastFilter().$and ?? [lastFilter()]) as Record<string, any>[]
    expect(parts.find((p) => p.assignedTo)!.assignedTo).toBe(DEV)
    expect(parts.find((p) => p.dueDate)!.dueDate).toEqual({ $lt: START })
  })

  it('My Tasks rejects a bad due filter or date', async () => {
    as(DEV)
    expect((await myTasks(new NextRequest('http://localhost/api/tasks/mine?due=late'))).status).toBe(400)
    expect((await myTasks(new NextRequest('http://localhost/api/tasks/mine?today=2026-99-99'))).status).toBe(400)
  })

  it('My Tasks counts overdue by calendar day and never counts finished work', async () => {
    as(DEV)
    const row = (n: string, status: string, day?: string) => ({
      _id: id(n),
      title: `T${n}`,
      status,
      priority: 'low',
      projectId: PROJECT,
      ...(day && { dueDate: new Date(`${day}T00:00:00Z`) }),
    })
    m.taskFind.mockReturnValue(
      chain([
        row('1', 'todo', '2026-10-09'), // overdue
        row('2', 'todo', '2026-10-10'), // due today: not overdue
        row('3', 'complete', '2026-10-01'), // finished: not overdue
        row('4', 'review', '2026-10-08'), // overdue (in review is still open)
        row('5', 'todo'), // no date
      ])
    )
    const body = await (await myTasks(new NextRequest('http://localhost/api/tasks/mine?include=all&today=2026-10-10'))).json()
    expect(body.overdue).toBe(2)
  })
})
