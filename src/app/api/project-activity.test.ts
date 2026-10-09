import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The activity feed end to end at the route level (models mocked):
 *  - what writes an entry, exactly once, and what must not;
 *  - who may read a project's feed.
 * The guard tests run the real authorization code with only the database and
 * the caller's identity stubbed.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    authorizeProject: vi.fn(),
    authorizeTask: vi.fn(),
    taskCreate: vi.fn(),
    taskCount: vi.fn(),
    taskUpdate: vi.fn(),
    taskFind: vi.fn(),
    taskFindById: vi.fn(),
    projectFindById: vi.fn(),
    teamExists: vi.fn(),
    teamFindById: vi.fn(),
    userExists: vi.fn(),
    userFind: vi.fn(),
    commentCreate: vi.fn(),
    activityFind: vi.fn(),
    syncProjectProgress: vi.fn(),
    emit: vi.fn(),
    record: vi.fn(),
    /** true: the guards are stubbed (write tests); false: the real guards run (read tests). */
    stubGuards: true,
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Task: {
    create: m.taskCreate,
    countDocuments: m.taskCount,
    findByIdAndUpdate: m.taskUpdate,
    find: m.taskFind,
    findById: m.taskFindById,
  },
  Project: { findById: m.projectFindById },
  Team: { exists: m.teamExists, findById: m.teamFindById },
  User: { exists: m.userExists, find: m.userFind },
  Comment: { create: m.commentCreate },
  Activity: { find: m.activityFind },
}))
vi.mock('@/lib/services/notifications', () => ({
  emitNotification: m.emit,
  actorName: vi.fn().mockResolvedValue('Someone'),
}))
vi.mock('@/lib/services/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/projects')>()),
  syncProjectProgress: m.syncProjectProgress,
}))
vi.mock('@/lib/auth/authorize', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/auth/authorize')>()
  return {
    ...real,
    authorizeProject: (...args: Parameters<typeof real.authorizeProject>) =>
      m.stubGuards ? m.authorizeProject(...args) : real.authorizeProject(...args),
    authorizeTask: (...args: Parameters<typeof real.authorizeTask>) =>
      m.stubGuards ? m.authorizeTask(...args) : real.authorizeTask(...args),
  }
})
vi.mock('@/lib/services/activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/activity')>()),
  recordActivity: m.record,
}))

import { POST as createTask } from './projects/[id]/tasks/route'
import { PUT as editTask } from './tasks/[id]/route'
import { PUT as setStatus } from './tasks/[id]/status/route'
import { POST as addComment } from './tasks/[id]/comments/route'

const id = (c: string) => c.repeat(24)
const LEADER = id('b')
const DEV = id('c')
const OTHER_DEV = id('d')
const OUTSIDER = id('e')
const TASK = id('1')
const PROJECT = id('2')

const project = { _id: PROJECT, title: 'P', owner: id('a'), team: id('3'), members: [id('a'), LEADER, DEV, OTHER_DEV] }
const stored = (status: string) => ({
  _id: TASK,
  title: 'Login Page',
  projectId: PROJECT,
  status,
  assignedTo: DEV,
  createdBy: LEADER,
})

const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
const params = (value: string) => ({ params: Promise.resolve({ id: value }) })

const chain = (value: unknown) => {
  const q: any = {}
  for (const step of ['populate', 'sort', 'skip', 'limit', 'select']) q[step] = () => q
  q.lean = () => Promise.resolve(value)
  q.then = (ok: any) => ok(value)
  return q
}

beforeEach(() => {
  vi.resetAllMocks()
  m.stubGuards = true
  m.teamFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ teamLeader: LEADER }) }) })
  m.taskUpdate.mockImplementation((_id: string, update: any) => chain({ ...stored(update.$set?.status ?? 'todo'), ...update.$set }))
})

describe('what writes a feed entry', () => {
  const asLeader = (status: string) =>
    m.authorizeTask.mockResolvedValue({ data: { userId: LEADER, task: stored(status), project, isEditor: true } })
  const asDeveloper = (status: string) =>
    m.authorizeTask.mockResolvedValue({ data: { userId: DEV, task: stored(status), project, isEditor: false } })
  const move = (status: string) =>
    setStatus(json(`/api/tasks/${TASK}/status`, 'PUT', { status }), params(TASK))

  it('creating a task records TASK_CREATED once, naming the assignee', async () => {
    m.authorizeProject.mockResolvedValue({ data: { userId: LEADER, project } })
    m.userExists.mockResolvedValue({ _id: DEV })
    m.taskCount.mockResolvedValue(0)
    m.taskCreate.mockResolvedValue({ _id: TASK, title: 'Login Page', assignedTo: DEV, populate: vi.fn() })

    const res = await createTask(json(`/api/projects/${PROJECT}/tasks`, 'POST', { title: 'Login Page', assignedTo: DEV }), params(PROJECT))
    expect(res.status).toBe(201)
    expect(m.record).toHaveBeenCalledTimes(1)
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT, actorId: LEADER, type: 'TASK_CREATED', taskId: TASK, metadata: { assigneeId: DEV } })
    )
  })

  it('reassigning a task records TASK_ASSIGNED once, with the previous and new assignee', async () => {
    m.authorizeTask.mockResolvedValue({ data: { userId: LEADER, task: stored('todo'), project, isEditor: true } })
    m.userExists.mockResolvedValue({ _id: OTHER_DEV })

    const res = await editTask(json(`/api/tasks/${TASK}`, 'PUT', { assignedTo: OTHER_DEV }), params(TASK))
    expect(res.status).toBe(200)
    expect(m.record).toHaveBeenCalledTimes(1)
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TASK_ASSIGNED', taskId: TASK, metadata: { assigneeId: OTHER_DEV, previousAssigneeId: DEV } })
    )
  })

  it('an edit that changes nothing about assignment or status records nothing', async () => {
    m.authorizeTask.mockResolvedValue({ data: { userId: LEADER, task: stored('todo'), project, isEditor: true } })
    expect((await editTask(json(`/api/tasks/${TASK}`, 'PUT', { title: 'Renamed' }), params(TASK))).status).toBe(200)
    expect(m.record).not.toHaveBeenCalled()
  })

  it.each([
    ['developer', 'todo', 'in-progress', 'TASK_STARTED'],
    ['developer', 'in-progress', 'review', 'TASK_SUBMITTED_FOR_REVIEW'],
    ['leader', 'review', 'in-progress', 'TASK_SENT_BACK'],
    ['leader', 'review', 'complete', 'TASK_COMPLETED'],
    ['leader', 'complete', 'in-progress', 'TASK_REOPENED'],
  ])('%s moving %s → %s records %s exactly once', async (who, from, to, type) => {
    who === 'leader' ? asLeader(from) : asDeveloper(from)
    expect((await move(to)).status).toBe(200)

    expect(m.record).toHaveBeenCalledTimes(1)
    expect(m.record).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT, type, taskId: TASK, metadata: expect.objectContaining({ from, to }) })
    )
  })

  it('sending a task back also says whom it went back to', async () => {
    asLeader('review')
    await move('in-progress')
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ assigneeId: DEV }) }))
  })

  it('stepping back to To Do is not worth a feed line', async () => {
    asDeveloper('in-progress')
    expect((await move('todo')).status).toBe(200)
    expect(m.record).not.toHaveBeenCalled()
  })

  it('a refused move records nothing', async () => {
    asDeveloper('review')
    expect((await move('complete')).status).toBe(403)
    asDeveloper('todo')
    expect((await move('complete')).status).toBe(400)
    expect(m.record).not.toHaveBeenCalled()
  })

  it('re-sending the current status (a re-fetch or retry) records nothing', async () => {
    asDeveloper('in-progress')
    expect((await move('in-progress')).status).toBe(200)
    expect(m.record).not.toHaveBeenCalled()
  })

  it('a comment records COMMENT_ADDED once, without its text', async () => {
    m.authorizeTask.mockResolvedValue({ data: { userId: DEV, task: stored('in-progress'), project } })
    m.commentCreate.mockResolvedValue({ _id: id('9'), populate: vi.fn() })

    const res = await addComment(json(`/api/tasks/${TASK}/comments`, 'POST', { text: 'secret details' }), params(TASK))
    expect(res.status).toBe(201)
    expect(m.record).toHaveBeenCalledTimes(1)
    const entry = m.record.mock.calls[0][0]
    expect(entry).toMatchObject({ type: 'COMMENT_ADDED', taskId: TASK, commentId: id('9') })
    expect(JSON.stringify(entry)).not.toContain('secret details')
  })
})

describe('who may read a project’s feed', () => {
  // The real guard and the real service run; only the database and identity are stubbed.
  let GET: typeof import('./projects/[id]/activity/route').GET

  const as = (userId: string, { leader = false } = {}) => {
    m.authenticate.mockResolvedValue({ user: { userId, role: 'developer' }, error: null })
    m.teamExists.mockResolvedValue(leader ? { _id: id('3') } : null)
  }
  const read = (query = '') =>
    GET(new NextRequest(`http://localhost/api/projects/${PROJECT}/activity${query}`), params(PROJECT))

  beforeEach(async () => {
    m.stubGuards = false
    GET = (await import('./projects/[id]/activity/route')).GET
    m.projectFindById.mockReturnValue(chain(project))
    m.taskFind.mockReturnValue(chain([{ _id: TASK }]))
    m.activityFind.mockReturnValue(chain([]))
    m.userFind.mockReturnValue(chain([]))
  })

  it('a project member gets 200', async () => {
    as(DEV)
    const res = await read()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ activities: [], hasMore: false })
  })

  it('someone outside the project gets 404, not even confirming it exists', async () => {
    as(OUTSIDER)
    expect((await read()).status).toBe(404)
    expect(m.activityFind).not.toHaveBeenCalled()
  })

  it('signed-out callers get 401', async () => {
    m.authenticate.mockResolvedValue({ user: null, error: 'Unauthorized' })
    expect((await read()).status).toBe(401)
  })

  it('a developer’s feed is limited to their own tasks and their own actions', async () => {
    as(DEV)
    await read()
    const filter = m.activityFind.mock.calls[0][0]
    expect(filter.projectId).toBe(PROJECT)
    expect(filter.$or).toEqual([{ taskId: { $in: [TASK] } }, { actorId: DEV }])
  })

  it('the team leader sees the whole project feed', async () => {
    as(LEADER, { leader: true })
    await read()
    expect(m.activityFind.mock.calls[0][0]).toEqual({ projectId: PROJECT })
  })

  it('there is no way to write an entry through the API', async () => {
    const mod = await import('./projects/[id]/activity/route')
    expect(Object.keys(mod).filter((k) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(k))).toEqual([])
  })
})
