import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Project templates at the route level. Only the database, the caller and the
 * side-effect services are stubbed, so the real validation, authorization,
 * scoping and creation/undo logic run.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    tplFind: vi.fn(),
    tplFindOne: vi.fn(),
    tplCreate: vi.fn(),
    tplCount: vi.fn(),
    tplUpdate: vi.fn(),
    tplDelete: vi.fn(),
    projFindOne: vi.fn(),
    projFindById: vi.fn(),
    projCreate: vi.fn(),
    projDeleteOne: vi.fn(),
    projDeleteMany: vi.fn(),
    taskInsertMany: vi.fn(),
    taskDeleteMany: vi.fn(),
    taskFind: vi.fn(),
    taskCount: vi.fn(),
    teamFindById: vi.fn(),
    otherModels: vi.fn(),
    notifyAssigned: vi.fn(),
    recordActivity: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  ProjectTemplate: { find: m.tplFind, findOne: m.tplFindOne, create: m.tplCreate, countDocuments: m.tplCount, findOneAndUpdate: m.tplUpdate, deleteOne: m.tplDelete },
  Project: { findOne: m.projFindOne, findById: m.projFindById, create: m.projCreate, deleteOne: m.projDeleteOne, deleteMany: m.projDeleteMany, findByIdAndUpdate: vi.fn() },
  Task: { insertMany: m.taskInsertMany, deleteMany: m.taskDeleteMany, find: m.taskFind, countDocuments: m.taskCount, create: m.otherModels },
  Team: { findById: m.teamFindById, exists: vi.fn() },
  Activity: { create: m.otherModels, deleteMany: m.otherModels },
  Comment: { create: m.otherModels, deleteMany: m.otherModels },
  Notification: { create: m.otherModels, deleteMany: m.otherModels },
  Report: { deleteMany: m.otherModels },
  User: { exists: vi.fn() },
}))
vi.mock('@/lib/services/notifications', () => ({ notifyProjectAssigned: m.notifyAssigned, actorName: vi.fn(), emitNotification: vi.fn() }))
vi.mock('@/lib/services/activity', () => ({ recordActivity: m.recordActivity }))
vi.mock('@/lib/services/attachments', () => ({ deleteProjectAttachments: vi.fn() }))
vi.mock('@/lib/services/dependencies', () => ({ deleteProjectDependencies: vi.fn() }))

import { GET as listGET, POST as createPOST } from './templates/route'
import { GET as oneGET, PUT as onePUT, DELETE as oneDELETE } from './templates/[id]/route'
import { POST as usePOST } from './templates/[id]/use/route'

const id = (c: string) => c.repeat(24)
const ADMIN = id('a')
const OTHER_ADMIN = id('9')
const LEADER = id('b')
const DEV = id('c')
const TPL = id('1')
const PROJECT = id('2')
const NEW_PROJECT = id('3')
const TEAM = id('4')

const as = (userId: string | null, role = 'admin') =>
  m.authenticate.mockResolvedValue(
    userId ? { user: { userId, role, status: 'active', email: `${role}@example.com` }, error: null } : { user: null, error: 'Unauthorized' }
  )

const req = (url: string, method = 'GET', body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, ...(body !== undefined && { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }) })
const ctx = (tid: string) => ({ params: Promise.resolve({ id: tid }) })

const chain = (value: unknown) => {
  const q: any = {}
  for (const step of ['select', 'sort', 'limit', 'populate']) q[step] = () => q
  q.lean = () => Promise.resolve(value)
  q.then = (ok: any, bad: any) => Promise.resolve(value).then(ok, bad)
  return q
}

const stored = (over: Record<string, unknown> = {}) => ({
  _id: TPL,
  name: 'Website launch',
  description: 'd',
  category: 'web',
  projectDescription: 'Ship the site',
  requirements: 'Be fast',
  tasks: [],
  createdBy: ADMIN,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-02T00:00:00Z'),
  ...over,
})

const newProjectDoc = () => ({ _id: NEW_PROJECT, title: 'New site', populate: vi.fn().mockResolvedValue(undefined) })

beforeEach(() => {
  vi.resetAllMocks()
  as(ADMIN)
  m.tplCount.mockResolvedValue(0)
  m.tplFind.mockImplementation(() => chain([stored()]))
  m.tplFindOne.mockImplementation(() => chain(stored()))
  m.tplCreate.mockImplementation(async (doc: any) => ({ ...stored(), ...doc, _id: TPL }))
  m.tplUpdate.mockImplementation(() => chain(stored()))
  m.tplDelete.mockResolvedValue({ deletedCount: 1 })
  m.projFindOne.mockResolvedValue(null)
  m.projCreate.mockImplementation(async () => newProjectDoc())
  m.projDeleteOne.mockResolvedValue({})
  m.taskInsertMany.mockResolvedValue([])
  m.taskDeleteMany.mockResolvedValue({})
  m.taskCount.mockResolvedValue(0)
  m.taskFind.mockImplementation(() => chain([]))
  m.teamFindById.mockResolvedValue(null)
  m.recordActivity.mockResolvedValue(undefined)
  m.notifyAssigned.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

const validTemplate = { name: 'Website launch', tasks: [{ title: 'Plan the launch', priority: 'high', dueOffsetDays: 3 }] }
const useBody = (over: Record<string, unknown> = {}) => ({ title: 'New site', requestId: 'req-12345678', ...over })

describe('who can use templates', () => {
  const calls: [string, () => Promise<Response>][] = [
    ['list', () => listGET(req('/api/templates'))],
    ['create', () => createPOST(req('/api/templates', 'POST', validTemplate))],
    ['get', () => oneGET(req(`/api/templates/${TPL}`), ctx(TPL))],
    ['update', () => onePUT(req(`/api/templates/${TPL}`, 'PUT', validTemplate), ctx(TPL))],
    ['delete', () => oneDELETE(req(`/api/templates/${TPL}`, 'DELETE'), ctx(TPL))],
    ['use', () => usePOST(req(`/api/templates/${TPL}/use`, 'POST', useBody()), ctx(TPL))],
  ]

  it.each(calls)('signed-out callers get 401 on %s and nothing is read or written', async (_n, call) => {
    as(null)
    expect((await call()).status).toBe(401)
    expect(m.tplFind).not.toHaveBeenCalled()
    expect(m.tplFindOne).not.toHaveBeenCalled()
    expect(m.tplCreate).not.toHaveBeenCalled()
    expect(m.projCreate).not.toHaveBeenCalled()
  })

  it.each(['team_leader', 'developer'])('%s gets 403 on every action (project creation is admin-only)', async (role) => {
    as(role === 'developer' ? DEV : LEADER, role)
    for (const [, call] of calls) expect((await call()).status).toBe(403)
    expect(m.tplFind).not.toHaveBeenCalled()
    expect(m.tplCreate).not.toHaveBeenCalled()
    expect(m.tplDelete).not.toHaveBeenCalled()
    expect(m.projCreate).not.toHaveBeenCalled()
    expect(m.taskInsertMany).not.toHaveBeenCalled()
  })
})

describe('library and ownership (no IDOR)', () => {
  it('lists only the caller\'s templates and never exposes owner or key', async () => {
    const res = await listGET(req('/api/templates'))
    expect(res.status).toBe(200)
    expect(m.tplFind.mock.calls[0][0]).toEqual({ createdBy: ADMIN })
    const text = JSON.stringify(await res.json())
    expect(text).toContain('Website launch')
    expect(text).not.toContain('createdBy')
    expect(text).not.toContain('nameKey')
  })

  it('every by-id lookup is scoped to the caller: another admin\'s template is a 404', async () => {
    as(OTHER_ADMIN)
    m.tplFindOne.mockImplementation((filter: any) => chain(filter.createdBy === ADMIN ? stored() : null))
    m.tplUpdate.mockImplementation((filter: any) => chain(filter.createdBy === ADMIN ? stored() : null))
    m.tplDelete.mockImplementation(async (filter: any) => ({ deletedCount: filter.createdBy === ADMIN ? 1 : 0 }))

    expect((await oneGET(req(`/api/templates/${TPL}`), ctx(TPL))).status).toBe(404)
    expect((await onePUT(req(`/api/templates/${TPL}`, 'PUT', validTemplate), ctx(TPL))).status).toBe(404)
    expect((await oneDELETE(req(`/api/templates/${TPL}`, 'DELETE'), ctx(TPL))).status).toBe(404)
    expect((await usePOST(req(`/api/templates/${TPL}/use`, 'POST', useBody()), ctx(TPL))).status).toBe(404)
    expect(m.tplFindOne.mock.calls[0][0]).toEqual({ _id: TPL, createdBy: OTHER_ADMIN })
    expect(m.tplUpdate.mock.calls[0][0]).toEqual({ _id: TPL, createdBy: OTHER_ADMIN })
    expect(m.tplDelete.mock.calls[0][0]).toEqual({ _id: TPL, createdBy: OTHER_ADMIN })
    expect(m.projCreate).not.toHaveBeenCalled()
  })

  it.each(['abc', '123', '%7B%22%24ne%22%3Anull%7D', 'x'.repeat(24)])('rejects the id %s with 400', async (bad) => {
    expect((await oneGET(req(`/api/templates/${bad}`), ctx(bad))).status).toBe(400)
    expect((await onePUT(req(`/api/templates/${bad}`, 'PUT', validTemplate), ctx(bad))).status).toBe(400)
    expect((await oneDELETE(req(`/api/templates/${bad}`, 'DELETE'), ctx(bad))).status).toBe(400)
    expect((await usePOST(req(`/api/templates/${bad}/use`, 'POST', useBody()), ctx(bad))).status).toBe(400)
    expect(m.tplFindOne).not.toHaveBeenCalled()
  })

  it('operator objects in the body never reach a query', async () => {
    const res = await createPOST(req('/api/templates', 'POST', { name: { $ne: '' }, tasks: [] }))
    expect(res.status).toBe(400)
    expect((await onePUT(req(`/api/templates/${TPL}`, 'PUT', { ...validTemplate, name: { $gt: '' } }), ctx(TPL))).status).toBe(400)
    expect(m.tplCreate).not.toHaveBeenCalled()
    expect(m.tplUpdate).not.toHaveBeenCalled()
  })
})

describe('template CRUD', () => {
  it('creates a valid template, with the owner from the session and not the request', async () => {
    const res = await createPOST(req('/api/templates', 'POST', { ...validTemplate, createdBy: OTHER_ADMIN, nameKey: 'hacked', tasks: [{ title: 'Plan the launch', status: 'complete', assignedTo: DEV }] }))
    expect(res.status).toBe(201)
    const saved = m.tplCreate.mock.calls[0][0]
    expect(saved.createdBy).toBe(ADMIN)
    expect(saved.nameKey).toBe('website launch')
    expect(saved.tasks[0]).toEqual({ title: 'Plan the launch' }) // status / assignee dropped
  })

  it('creates a template with no tasks', async () => {
    expect((await createPOST(req('/api/templates', 'POST', { name: 'Just a shell' }))).status).toBe(201)
    expect(m.tplCreate.mock.calls[0][0].tasks).toEqual([])
  })

  it.each([
    ['empty name', { name: '', tasks: [] }],
    ['invalid priority', { name: 'Valid name', tasks: [{ title: 'Plan the launch', priority: 'critical' }] }],
    ['too many tasks', { name: 'Valid name', tasks: Array.from({ length: 51 }, () => ({ title: 'Plan the launch' })) }],
    ['bad offset', { name: 'Valid name', tasks: [{ title: 'Plan the launch', dueOffsetDays: -3 }] }],
  ])('rejects %s with 400 and writes nothing', async (_l, body) => {
    const res = await createPOST(req('/api/templates', 'POST', body))
    expect(res.status).toBe(400)
    expect(await res.json()).toHaveProperty('error')
    expect(m.tplCreate).not.toHaveBeenCalled()
  })

  it('accepts exactly 50 tasks', async () => {
    const body = { name: 'Fifty tasks', tasks: Array.from({ length: 50 }, (_, i) => ({ title: `Task number ${i}` })) }
    expect((await createPOST(req('/api/templates', 'POST', body))).status).toBe(201)
  })

  it('a second identical save is a clear 409, not a duplicate', async () => {
    m.tplCreate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
    const res = await createPOST(req('/api/templates', 'POST', validTemplate))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already have a template/i)
  })

  it('stops at the per-owner limit', async () => {
    m.tplCount.mockResolvedValue(100)
    expect((await createPOST(req('/api/templates', 'POST', validTemplate))).status).toBe(400)
    expect(m.tplCreate).not.toHaveBeenCalled()
  })

  it('edits only the template: the update targets the template collection and nothing else', async () => {
    const res = await onePUT(req(`/api/templates/${TPL}`, 'PUT', { ...validTemplate, name: 'Renamed' }), ctx(TPL))
    expect(res.status).toBe(200)
    expect(m.tplUpdate.mock.calls[0][1]).toMatchObject({ name: 'Renamed', nameKey: 'renamed' })
    expect(m.projCreate).not.toHaveBeenCalled()
    expect(m.projFindById).not.toHaveBeenCalled()
    expect(m.taskInsertMany).not.toHaveBeenCalled()
    expect(m.otherModels).not.toHaveBeenCalled()
  })

  it('renaming onto an existing name is a 409', async () => {
    m.tplUpdate.mockImplementation(() => {
      throw Object.assign(new Error('dup'), { code: 11000 })
    })
    expect((await onePUT(req(`/api/templates/${TPL}`, 'PUT', validTemplate), ctx(TPL))).status).toBe(409)
  })

  it('deleting a template deletes only that template, never projects or tasks made from it', async () => {
    const res = await oneDELETE(req(`/api/templates/${TPL}`, 'DELETE'), ctx(TPL))
    expect(res.status).toBe(200)
    expect(m.tplDelete).toHaveBeenCalledTimes(1)
    for (const fn of [m.projDeleteOne, m.projDeleteMany, m.taskDeleteMany, m.otherModels]) expect(fn).not.toHaveBeenCalled()
  })
})

describe('save a project as a template', () => {
  const project = (owner: string, over: Record<string, unknown> = {}) => ({
    _id: PROJECT,
    title: 'Client portal',
    description: 'Portal for clients',
    requirements: 'Secure',
    owner,
    members: [owner],
    startDate: new Date('2026-10-01T00:00:00Z'),
    createdAt: new Date('2026-09-20T00:00:00Z'),
    ...over,
  })
  const tasks = [
    { _id: id('7'), title: 'Design screens', description: 'figma', priority: 'high', status: 'complete', assignedTo: DEV, dueDate: new Date('2026-10-08T00:00:00Z'), completedAt: new Date() },
    { _id: id('8'), title: 'Build API', priority: 'urgent', status: 'in-progress', assignedTo: DEV },
  ]

  it('copies only reusable structure', async () => {
    m.projFindById.mockImplementation(() => chain(project(ADMIN)))
    m.taskFind.mockImplementation(() => chain(tasks))
    const res = await createPOST(req('/api/templates', 'POST', { fromProjectId: PROJECT }))
    expect(res.status).toBe(201)
    const saved = m.tplCreate.mock.calls[0][0]
    expect(saved).toMatchObject({ name: 'Client portal template', projectDescription: 'Portal for clients', requirements: 'Secure', createdBy: ADMIN })
    expect(saved.tasks).toEqual([
      { title: 'Design screens', description: 'figma', priority: 'high', dueOffsetDays: 7 },
      { title: 'Build API', priority: 'urgent' },
    ])
    const text = JSON.stringify(saved)
    for (const leak of [PROJECT, DEV, 'complete', 'in-progress', 'completedAt', id('7')]) expect(text).not.toContain(leak)
  })

  it('refuses a project the caller does not own (404 when not a member, 403 when only a member)', async () => {
    m.projFindById.mockImplementation(() => chain(project(OTHER_ADMIN, { members: [OTHER_ADMIN] })))
    expect((await createPOST(req('/api/templates', 'POST', { fromProjectId: PROJECT }))).status).toBe(404)
    m.projFindById.mockImplementation(() => chain(project(OTHER_ADMIN, { members: [OTHER_ADMIN, ADMIN] })))
    expect((await createPOST(req('/api/templates', 'POST', { fromProjectId: PROJECT }))).status).toBe(403)
    expect(m.tplCreate).not.toHaveBeenCalled()
  })

  it('submitting the same save twice yields one template and a clear 409', async () => {
    m.projFindById.mockImplementation(() => chain(project(ADMIN)))
    m.tplCreate.mockResolvedValueOnce(stored()).mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
    expect((await createPOST(req('/api/templates', 'POST', { fromProjectId: PROJECT }))).status).toBe(201)
    expect((await createPOST(req('/api/templates', 'POST', { fromProjectId: PROJECT }))).status).toBe(409)
  })

  it('an invalid project id is a 400', async () => {
    expect((await createPOST(req('/api/templates', 'POST', { fromProjectId: 'nope' }))).status).toBe(400)
  })
})

describe('create a project from a template', () => {
  const withTasks = (n: number, over: Record<string, unknown> = {}) =>
    stored({
      tasks: Array.from({ length: n }, (_, i) => ({ title: `Task number ${i}`, description: `d${i}`, priority: i % 2 ? 'high' : 'low', dueOffsetDays: i * 2 })),
      ...over,
    })
  const use = (body = useBody()) => usePOST(req(`/api/templates/${TPL}/use`, 'POST', body), ctx(TPL))
  const insertedTasks = () => m.taskInsertMany.mock.calls[0][0] as any[]

  it('a zero-task template makes just the project', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(0)))
    const res = await use()
    expect(res.status).toBe(201)
    expect((await res.json()).tasksCreated).toBe(0)
    expect(m.projCreate).toHaveBeenCalledTimes(1)
    expect(m.taskInsertMany).not.toHaveBeenCalled()
    expect(m.recordActivity).not.toHaveBeenCalled()
  })

  it('a one-task template makes one task in the new project', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(1)))
    m.taskFind.mockImplementation(() => chain([{ _id: id('7') }]))
    const res = await use()
    expect(res.status).toBe(201)
    expect((await res.json()).tasksCreated).toBe(1)
    expect(insertedTasks()).toHaveLength(1)
    expect(insertedTasks()[0].projectId).toBe(NEW_PROJECT)
  })

  it('a multi-task template makes every task, in order, all To Do and unassigned', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(5)))
    m.taskFind.mockImplementation(() => chain(Array.from({ length: 5 }, (_, i) => ({ _id: id(String(i)) }))))
    const res = await use(useBody({ today: '2026-10-09' }) as any)
    expect(res.status).toBe(201)
    const tasks = insertedTasks()
    expect(tasks.map((t) => t.title)).toEqual(['Task number 0', 'Task number 1', 'Task number 2', 'Task number 3', 'Task number 4'])
    expect(tasks.map((t) => t.order)).toEqual([0, 1, 2, 3, 4])
    for (const t of tasks) {
      expect(t.status).toBe('todo')
      expect(t.projectId).toBe(NEW_PROJECT)
      expect(t.createdBy).toBe(ADMIN)
      expect(t.actualHours).toBe(0)
      for (const forbidden of ['assignedTo', 'completedAt', 'startedAt', 'comments', 'attachments', 'dependencies']) expect(t).not.toHaveProperty(forbidden)
    }
    expect(tasks.map((t) => t.priority)).toEqual(['low', 'high', 'low', 'high', 'low'])
  })

  it('copies nothing but tasks: no comments, attachments, notifications or dependencies are created', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(3)))
    m.taskFind.mockImplementation(() => chain([{ _id: id('1') }]))
    await use()
    expect(m.otherModels).not.toHaveBeenCalled()
    expect(m.notifyAssigned).not.toHaveBeenCalled() // no team chosen
  })

  it('due-date offsets count from the project start date (documented rule)', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(3)))
    await use(useBody({ startDate: '2026-11-01', today: '2026-10-09' }) as any)
    expect(insertedTasks().map((t) => t.dueDate.toISOString().slice(0, 10))).toEqual(['2026-11-01', '2026-11-03', '2026-11-05'])
  })

  it('without a start date they count from the viewer\'s today; without that, the server date', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(2)))
    await use(useBody({ today: '2026-10-09' }) as any)
    expect(insertedTasks().map((t) => t.dueDate.toISOString().slice(0, 10))).toEqual(['2026-10-09', '2026-10-11'])

    m.taskInsertMany.mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    await use(useBody({ requestId: 'req-87654321' }) as any)
    expect(insertedTasks().map((t) => t.dueDate.toISOString().slice(0, 10))).toEqual(['2026-10-20', '2026-10-22'])
  })

  it('a blueprint without an offset gets no due date, and old absolute dates are never copied', async () => {
    m.tplFindOne.mockImplementation(() => chain(stored({ tasks: [{ title: 'No due date here', priority: 'medium' }] })))
    await use()
    expect(insertedTasks()[0].dueDate).toBeUndefined()
  })

  it('the project is owned by the caller and fields come from the request, falling back to the template', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(1)))
    await use(useBody({ owner: OTHER_ADMIN, progress: 100, members: [DEV], status: 'completed' }) as any)
    const created = m.projCreate.mock.calls[0][0]
    expect(created).toMatchObject({ title: 'New site', description: 'Ship the site', requirements: 'Be fast', owner: ADMIN, progress: 0, creationKey: 'req-12345678' })
    expect(created.members).toEqual([ADMIN])
    expect(created.status).toBeUndefined()
  })

  it('staffs a chosen team through the usual path, and tells its people once', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(1)))
    m.teamFindById.mockResolvedValue({ _id: TEAM, teamLeader: LEADER, members: [DEV] })
    await use(useBody({ teamId: TEAM }) as any)
    expect(m.projCreate.mock.calls[0][0].members.sort()).toEqual([ADMIN, DEV, LEADER].sort())
    expect(m.notifyAssigned).toHaveBeenCalledTimes(1)
  })

  it('an unknown team is a 404 and creates nothing', async () => {
    const res = await use(useBody({ teamId: TEAM }) as any)
    expect(res.status).toBe(404)
    expect(m.projCreate).not.toHaveBeenCalled()
  })

  it('leaves the same entry as normal task creation: one TASK_CREATED per task', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(3)))
    m.taskFind.mockImplementation(() => chain([{ _id: id('1') }, { _id: id('2') }, { _id: id('3') }]))
    await use()
    expect(m.recordActivity).toHaveBeenCalledTimes(3)
    for (const [call] of m.recordActivity.mock.calls) expect(call).toMatchObject({ projectId: NEW_PROJECT, actorId: ADMIN, type: 'TASK_CREATED' })
  })

  it('does not change the template, and editing it later does not touch made projects', async () => {
    m.tplFindOne.mockImplementation(() => chain(withTasks(2)))
    await use()
    expect(m.tplUpdate).not.toHaveBeenCalled()
    expect(m.tplCreate).not.toHaveBeenCalled()
    expect(m.tplDelete).not.toHaveBeenCalled()
  })

  describe('repeated submissions', () => {
    it('the same request id returns the project already made, without making another', async () => {
      m.projFindOne.mockResolvedValue({ _id: NEW_PROJECT, populate: vi.fn().mockResolvedValue(undefined) })
      m.taskCount.mockResolvedValue(4)
      const res = await use()
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ duplicate: true, tasksCreated: 4 })
      expect(m.projCreate).not.toHaveBeenCalled()
      expect(m.taskInsertMany).not.toHaveBeenCalled()
      expect(m.projFindOne.mock.calls[0][0]).toEqual({ owner: ADMIN, creationKey: 'req-12345678' })
    })

    it('two simultaneous identical requests: the loser of the race gets the winner\'s project', async () => {
      m.projCreate.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }))
      m.projFindOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: NEW_PROJECT, populate: vi.fn().mockResolvedValue(undefined) })
      const res = await use()
      expect(res.status).toBe(200)
      expect((await res.json()).duplicate).toBe(true)
      expect(m.taskInsertMany).not.toHaveBeenCalled()
    })
  })

  describe('failure while creating tasks', () => {
    beforeEach(() => {
      m.tplFindOne.mockImplementation(() => chain(withTasks(3)))
      m.taskInsertMany.mockRejectedValue(new Error('boom'))
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    it('removes the new project and its tasks, only those, and says nothing was created', async () => {
      const res = await use()
      expect(res.status).toBe(500)
      expect((await res.json()).error).toMatch(/nothing was created/i)
      expect(m.taskDeleteMany).toHaveBeenCalledWith({ projectId: NEW_PROJECT })
      expect(m.projDeleteOne).toHaveBeenCalledWith({ _id: NEW_PROJECT })
      // No notification, activity or other model was touched: there is nothing of theirs to undo.
      expect(m.notifyAssigned).not.toHaveBeenCalled()
      expect(m.recordActivity).not.toHaveBeenCalled()
      expect(m.otherModels).not.toHaveBeenCalled()
    })

    it('if the undo itself fails the caller is told which project is left over', async () => {
      m.taskDeleteMany.mockRejectedValue(new Error('still down'))
      const res = await use()
      expect(res.status).toBe(500)
      expect((await res.json()).error).toMatch(/New site.*could not be removed/i)
    })
  })

  it('validation errors never create a project', async () => {
    for (const body of [{ title: 'ab', requestId: 'req-12345678' }, { title: 'New site' }, useBody({ startDate: '2026-02-30' }), useBody({ startDate: '2026-10-10', deadline: '2026-10-01' })]) {
      expect((await use(body as any)).status).toBe(400)
    }
    expect(m.projCreate).not.toHaveBeenCalled()
  })
})
