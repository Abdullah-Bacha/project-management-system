import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Route-level checks (models mocked) for the data-integrity fixes: task
 * assignment validation, progress sync, and the project-delete cascade.
 * The real authorization guards are replaced by stubs here; their behaviour
 * is covered by the HTTP suites in /tests.
 */

const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authorizeProject: vi.fn(),
    authorizeTask: vi.fn(),
    syncProjectProgress: vi.fn(),
    userExists: vi.fn(),
    taskCount: vi.fn(),
    taskCreate: vi.fn(),
    taskFind: vi.fn(),
    taskUpdate: vi.fn(),
    taskDelete: vi.fn(),
    taskDeleteMany: vi.fn(),
    commentDeleteMany: vi.fn(),
    notificationDeleteMany: vi.fn(),
    reportDeleteMany: vi.fn(),
    projectDelete: vi.fn(),
    emit: vi.fn(),
    activityDeleteMany: vi.fn(),
    dependencyDeleteMany: vi.fn(),
    deleteTaskFiles: vi.fn(),
    deleteProjectFiles: vi.fn(),
    deleteSharedProjectFiles: vi.fn(),
    record: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/db/models', () => ({
  User: { exists: m.userExists },
  Task: {
    countDocuments: m.taskCount,
    create: m.taskCreate,
    find: m.taskFind,
    findByIdAndUpdate: m.taskUpdate,
    findByIdAndDelete: m.taskDelete,
    deleteMany: m.taskDeleteMany,
  },
  Comment: { deleteMany: m.commentDeleteMany },
  Notification: { deleteMany: m.notificationDeleteMany },
  Report: { deleteMany: m.reportDeleteMany },
  Activity: { deleteMany: m.activityDeleteMany },
  TaskDependency: { deleteMany: m.dependencyDeleteMany },
  Project: { findByIdAndDelete: m.projectDelete },
}))
vi.mock('@/lib/services/notifications', () => ({
  emitNotification: m.emit,
  actorName: vi.fn().mockResolvedValue('Team Leader'),
  notifyProjectAssigned: vi.fn(),
}))
vi.mock('@/lib/services/project-files', () => ({ deleteProjectFiles: m.deleteSharedProjectFiles }))
vi.mock('@/lib/services/attachments', () => ({
  deleteTaskAttachments: m.deleteTaskFiles,
  deleteProjectAttachments: m.deleteProjectFiles,
}))
vi.mock('@/lib/services/activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/activity')>()),
  recordActivity: m.record,
}))
vi.mock('@/lib/auth/authorize', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/authorize')>()),
  authorizeProject: m.authorizeProject,
  authorizeTask: m.authorizeTask,
}))
vi.mock('@/lib/services/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/projects')>()),
  syncProjectProgress: m.syncProjectProgress,
}))

import { POST as createTask } from './projects/[id]/tasks/route'
import { PUT as editTask, DELETE as deleteTask } from './tasks/[id]/route'
import { DELETE as deleteProject } from './projects/[id]/route'

const PROJECT_ID = 'p'.padEnd(24, '1')
const TASK_ID = 't'.padEnd(24, '2')
const EDITOR = 'e'.padEnd(24, '3').replace(/[^a-f\d]/g, 'e')
const MEMBER = 'a'.repeat(24)
const OUTSIDER = 'c'.repeat(24)

const project = { _id: PROJECT_ID, title: 'P', owner: EDITOR, members: [EDITOR, MEMBER] }
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const json = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

/** Awaitable + chainable, like a mongoose query. */
const chain = (value: unknown) => {
  const q: any = { populate: () => q, then: (ok: any) => ok(value) }
  return q
}

beforeEach(() => {
  vi.resetAllMocks()
  m.authorizeProject.mockResolvedValue({ data: { userId: EDITOR, project } })
  m.taskCount.mockResolvedValue(0)
})

describe('task creation', () => {
  const create = (body: unknown) =>
    createTask(json(`/api/projects/${PROJECT_ID}/tasks`, 'POST', body), params(PROJECT_ID))

  it('assigns a valid project member and updates project progress', async () => {
    m.userExists.mockResolvedValue({ _id: MEMBER })
    const task = { _id: TASK_ID, title: 'Do it', assignedTo: MEMBER, populate: vi.fn() }
    m.taskCreate.mockResolvedValue(task)

    const res = await create({ title: 'Do it', assignedTo: MEMBER })
    expect(res.status).toBe(201)
    expect(m.syncProjectProgress).toHaveBeenCalledWith(PROJECT_ID)
  })

  it('updates progress for an unassigned task too', async () => {
    m.taskCreate.mockResolvedValue({ _id: TASK_ID, title: 'Do it', populate: vi.fn() })
    expect((await create({ title: 'Do it' })).status).toBe(201)
    expect(m.syncProjectProgress).toHaveBeenCalledTimes(1)
  })

  it('rejects an assignee who is not a project member, creating nothing', async () => {
    m.userExists.mockResolvedValue({ _id: OUTSIDER })
    const res = await create({ title: 'Do it', assignedTo: OUTSIDER })
    expect(res.status).toBe(400)
    expect(m.taskCreate).not.toHaveBeenCalled()
    expect(m.syncProjectProgress).not.toHaveBeenCalled()
  })

  it('rejects an invalid ObjectId with the shared validation shape', async () => {
    const res = await create({ title: 'Do it', assignedTo: 'not-an-id' })
    const body = await res.json()
    expect(res.status).toBe(400)
    expect(body.error).toBe('Validation failed')
    expect(body.details.length).toBeGreaterThan(0)
    expect(m.taskCreate).not.toHaveBeenCalled()
  })
})

describe('task editing', () => {
  const task = { _id: TASK_ID, projectId: PROJECT_ID, status: 'todo', assignedTo: MEMBER }
  const edit = (body: unknown) =>
    editTask(json(`/api/tasks/${TASK_ID}`, 'PUT', body), params(TASK_ID))
  const updated = { _id: TASK_ID, title: 'T', createdBy: EDITOR }

  beforeEach(() => {
    m.authorizeTask.mockResolvedValue({ data: { userId: EDITOR, task, project } })
    m.taskUpdate.mockReturnValue(chain(updated))
  })

  it('reassigns to another project member', async () => {
    m.userExists.mockResolvedValue({ _id: EDITOR })
    expect((await edit({ assignedTo: EDITOR })).status).toBe(200)
  })

  it('refuses to reassign to a non-member and writes nothing', async () => {
    const res = await edit({ assignedTo: OUTSIDER })
    expect(res.status).toBe(400)
    expect(m.taskUpdate).not.toHaveBeenCalled()
  })

  it('refuses an invalid ObjectId', async () => {
    expect((await edit({ assignedTo: 'nope' })).status).toBe(400)
    expect(m.taskUpdate).not.toHaveBeenCalled()
  })

  it('still lets an editor edit a task whose unchanged assignee has left the project', async () => {
    m.authorizeTask.mockResolvedValue({
      data: { userId: EDITOR, task: { ...task, assignedTo: OUTSIDER }, project },
    })
    expect((await edit({ title: 'Renamed', assignedTo: OUTSIDER })).status).toBe(200)
  })

  it('allows clearing the assignee', async () => {
    expect((await edit({ assignedTo: null })).status).toBe(200)
  })

  it('updates progress when a task is completed or reopened', async () => {
    m.authorizeTask.mockResolvedValue({
      data: { userId: EDITOR, task: { ...task, status: 'review' }, project },
    })
    expect((await edit({ status: 'complete' })).status).toBe(200)
    expect(m.syncProjectProgress).toHaveBeenCalledTimes(1)

    m.authorizeTask.mockResolvedValue({
      data: { userId: EDITOR, task: { ...task, status: 'complete' }, project },
    })
    expect((await edit({ status: 'in-progress' })).status).toBe(200)
    expect(m.syncProjectProgress).toHaveBeenCalledTimes(2)
  })

  it('refuses an illegal status jump in a full edit and writes nothing', async () => {
    const res = await edit({ status: 'complete' }) // To Do -> Complete
    expect(res.status).toBe(400)
    expect(m.taskUpdate).not.toHaveBeenCalled()
    expect(m.syncProjectProgress).not.toHaveBeenCalled()
  })

  it('does not recompute progress when status is unchanged', async () => {
    await edit({ title: 'Just a rename' })
    expect(m.syncProjectProgress).not.toHaveBeenCalled()
  })
})

describe('task deletion', () => {
  it('updates project progress afterwards', async () => {
    m.authorizeTask.mockResolvedValue({
      data: { userId: EDITOR, task: { _id: TASK_ID, projectId: PROJECT_ID }, project },
    })
    const res = await deleteTask(json(`/api/tasks/${TASK_ID}`, 'DELETE'), params(TASK_ID))
    expect(res.status).toBe(200)
    expect(m.syncProjectProgress).toHaveBeenCalledWith(PROJECT_ID)
    // The task's attached files are cleaned up with it.
    expect(m.deleteTaskFiles).toHaveBeenCalledWith(TASK_ID)
    // Relationships on either side of the task go with it.
    expect(m.dependencyDeleteMany).toHaveBeenCalledWith({ $or: [{ blockedTaskId: TASK_ID }, { blockingTaskId: TASK_ID }] })
  })
})

describe('project deletion cascade', () => {
  it('removes tasks, comments, notifications and reports of that project only', async () => {
    const taskIds = ['x'.repeat(24), 'y'.repeat(24)]
    m.authorizeProject.mockResolvedValue({ data: { userId: EDITOR, project } })
    m.taskFind.mockReturnValue({ select: () => Promise.resolve(taskIds.map((_id) => ({ _id }))) })

    const res = await deleteProject(
      json(`/api/projects/${PROJECT_ID}`, 'DELETE'),
      params(PROJECT_ID)
    )

    expect(res.status).toBe(200)
    expect(m.reportDeleteMany).toHaveBeenCalledWith({ project: PROJECT_ID })
    expect(m.taskDeleteMany).toHaveBeenCalledWith({ projectId: PROJECT_ID })
    expect(m.notificationDeleteMany).toHaveBeenCalledWith({ projectId: PROJECT_ID })
    expect(m.commentDeleteMany).toHaveBeenCalledWith({ taskId: { $in: taskIds } })
    expect(m.activityDeleteMany).toHaveBeenCalledWith({ projectId: PROJECT_ID })
    expect(m.deleteProjectFiles).toHaveBeenCalledWith(PROJECT_ID)
    // The project's shared reference files go too.
    expect(m.deleteSharedProjectFiles).toHaveBeenCalledWith(PROJECT_ID)
    expect(m.dependencyDeleteMany).toHaveBeenCalledWith({ projectId: PROJECT_ID })
    expect(m.projectDelete).toHaveBeenCalledWith(PROJECT_ID)
  })
})
