import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => {
  // The real authorize module is loaded for its other exports; its JWT helper wants these set.
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
  authorizeTask: vi.fn(),
  authorizeProject: vi.fn(),
  taskUpdate: vi.fn(),
  taskFind: vi.fn(),
  commentCreate: vi.fn(),
  teamFindById: vi.fn(),
  syncProjectProgress: vi.fn(),
  emit: vi.fn(),
  actorName: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/db/models', () => ({
  Task: { findByIdAndUpdate: m.taskUpdate, find: m.taskFind },
  Comment: { create: m.commentCreate },
  Team: { findById: m.teamFindById },
  User: {},
  Project: {},
  Notification: {},
}))
vi.mock('@/lib/services/notifications', () => ({
  emitNotification: m.emit,
  actorName: m.actorName,
}))
vi.mock('@/lib/auth/authorize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/authorize')>()),
  authorizeTask: m.authorizeTask,
  authorizeProject: m.authorizeProject,
}))
vi.mock('@/lib/services/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/projects')>()),
  syncProjectProgress: m.syncProjectProgress,
}))

import { PUT as setStatus } from './tasks/[id]/status/route'
import { GET as listTasks } from './projects/[id]/tasks/route'
import { POST as addComment } from './tasks/[id]/comments/route'

const id = (c: string) => c.repeat(24)
const DEV = id('a')
const LEADER = id('b')
const ADMIN = id('c')
const TASK = id('d')
const PROJECT = id('e')

const project = { _id: PROJECT, title: 'Website', team: id('f'), owner: ADMIN, members: [ADMIN, LEADER, DEV] }
const params = (value: string) => ({ params: Promise.resolve({ id: value }) })
const put = (status: string) =>
  setStatus(
    new NextRequest(`http://localhost/api/tasks/${TASK}/status`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    }),
    params(TASK)
  )

/** The task as it is stored, plus what the update returns. */
const storedTask = (status: string) => ({ _id: TASK, title: 'Build Login Page', projectId: PROJECT, status, assignedTo: DEV, createdBy: LEADER })

const asDeveloper = (status: string) =>
  m.authorizeTask.mockResolvedValue({ data: { userId: DEV, task: storedTask(status), project, isEditor: false } })
const asLeader = (status: string) =>
  m.authorizeTask.mockResolvedValue({ data: { userId: LEADER, task: storedTask(status), project, isEditor: true } })

const chain = (value: unknown) => {
  const q: any = { populate: () => q, then: (ok: any) => ok(value) }
  return q
}

beforeEach(() => {
  vi.resetAllMocks()
  m.actorName.mockResolvedValue('Abdullah')
  m.taskUpdate.mockImplementation((_id: string, update: any) =>
    chain({ ...storedTask(update.$set.status), startedAt: update.$set.startedAt, completedAt: update.$set.completedAt })
  )
  m.teamFindById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ teamLeader: LEADER }) }) })
})

describe('developer status changes', () => {
  it('starts a task: stamps startedAt on the server and sends no notification', async () => {
    asDeveloper('todo')
    expect((await put('in-progress')).status).toBe(200)

    const update = m.taskUpdate.mock.calls[0][1]
    expect(update.$set.status).toBe('in-progress')
    expect(update.$set.startedAt).toBeInstanceOf(Date)
    expect(m.syncProjectProgress).toHaveBeenCalledWith(PROJECT)
    expect(m.emit).not.toHaveBeenCalled()
  })

  it('submits for review: no completedAt, and the leader is told', async () => {
    asDeveloper('in-progress')
    expect((await put('review')).status).toBe(200)

    const update = m.taskUpdate.mock.calls[0][1]
    expect(update.$set.completedAt).toBeUndefined()
    expect(m.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: LEADER, message: 'Abdullah submitted "Build Login Page" for review' })
    )
  })

  it('stepping back to To Do clears startedAt', async () => {
    asDeveloper('in-progress')
    expect((await put('todo')).status).toBe(200)
    expect(m.taskUpdate.mock.calls[0][1].$unset).toEqual({ startedAt: '' })
  })

  it.each([
    ['todo', 'complete', 400],
    ['todo', 'review', 400],
    ['review', 'todo', 400],
    ['review', 'complete', 403],
    ['review', 'in-progress', 403],
    ['complete', 'in-progress', 403],
  ])('is refused: %s → %s (%i), and nothing is written', async (from, to, code) => {
    asDeveloper(from)
    expect((await put(to)).status).toBe(code)
    expect(m.taskUpdate).not.toHaveBeenCalled()
    expect(m.emit).not.toHaveBeenCalled()
  })
})

describe('leader review', () => {
  it('completes a task in review: stamps completedAt and tells the developer', async () => {
    asLeader('review')
    expect((await put('complete')).status).toBe(200)

    expect(m.taskUpdate.mock.calls[0][1].$set.completedAt).toBeInstanceOf(Date)
    expect(m.syncProjectProgress).toHaveBeenCalledWith(PROJECT)
    expect(m.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: DEV, type: 'task-completed', message: expect.stringContaining('"Build Login Page" was completed') })
    )
  })

  it('sends a task back: still incomplete, and the developer is told', async () => {
    asLeader('review')
    expect((await put('in-progress')).status).toBe(200)

    expect(m.taskUpdate.mock.calls[0][1].$set.completedAt).toBeUndefined()
    expect(m.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: DEV, message: '"Build Login Page" was sent back for changes' })
    )
  })

  it('reopens a completed task: clears completedAt, starts a new cycle, recomputes progress', async () => {
    asLeader('complete')
    expect((await put('in-progress')).status).toBe(200)

    const update = m.taskUpdate.mock.calls[0][1]
    expect(update.$unset).toEqual({ completedAt: '' })
    expect(update.$set.startedAt).toBeInstanceOf(Date)
    expect(m.syncProjectProgress).toHaveBeenCalledWith(PROJECT)
  })

  it('cannot jump straight to Complete either', async () => {
    asLeader('todo')
    expect((await put('complete')).status).toBe(400)
    expect(m.taskUpdate).not.toHaveBeenCalled()
  })
})

describe('what a developer can list', () => {
  const list = () =>
    listTasks(new NextRequest(`http://localhost/api/projects/${PROJECT}/tasks`), params(PROJECT))

  it('only their own tasks', async () => {
    m.authorizeProject.mockResolvedValue({ data: { userId: DEV, project, isEditor: false } })
    m.taskFind.mockReturnValue(chain([]))
    await list()
    expect(m.taskFind.mock.calls[0][0]).toMatchObject({ projectId: PROJECT, assignedTo: DEV })
  })

  it('a team leader / owner sees the whole project', async () => {
    m.authorizeProject.mockResolvedValue({ data: { userId: LEADER, project, isEditor: true } })
    m.taskFind.mockReturnValue(chain([]))
    await list()
    expect(m.taskFind.mock.calls[0][0]).not.toHaveProperty('assignedTo')
  })
})

describe('comment notifications', () => {
  const comment = (userId: string, task: object) => {
    m.authorizeTask.mockResolvedValue({ data: { userId, task, project } })
    m.commentCreate.mockResolvedValue({ populate: vi.fn() })
    return addComment(
      new NextRequest(`http://localhost/api/tasks/${TASK}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Looks good' }),
      }),
      params(TASK)
    )
  }

  it('goes only to the task assignee and creator, not the commenter', async () => {
    await comment(DEV, { _id: TASK, title: 'T', assignedTo: DEV, createdBy: LEADER })
    expect(m.emit).toHaveBeenCalledTimes(1)
    expect(m.emit).toHaveBeenCalledWith(expect.objectContaining({ userId: LEADER, type: 'comment-added' }))
  })

  it('notifies once when the creator is also the assignee', async () => {
    await comment(ADMIN, { _id: TASK, title: 'T', assignedTo: DEV, createdBy: DEV })
    expect(m.emit).toHaveBeenCalledTimes(1)
  })
})
