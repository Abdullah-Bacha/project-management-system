import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  activityCreate: vi.fn(),
  activityFind: vi.fn(),
  taskFind: vi.fn(),
  userFind: vi.fn(),
}))

vi.mock('@/lib/db/models', () => ({
  Activity: { create: m.activityCreate, find: m.activityFind },
  Task: { find: m.taskFind },
  User: { find: m.userFind },
}))

import { ACTIVITY_PAGE_SIZE, activityForMove, listActivity, recordActivity } from './activity'
import { activitySentence } from '@/lib/activity-text'
import type { ActivityItem } from '@/types'

const id = (c: string) => c.repeat(24)
const PROJECT = id('1')
const VIEWER = id('2')

const chain = (rows: unknown[]) => {
  const q: any = {}
  for (const step of ['select', 'sort', 'skip', 'limit', 'populate']) q[step] = vi.fn(() => q)
  q.lean = () => Promise.resolve(rows)
  return q
}

const row = (n: number, extra: Record<string, unknown> = {}) => ({
  _id: id(String(n % 10)) + n,
  type: 'TASK_STARTED',
  createdAt: new Date(Date.UTC(2026, 9, 8, 12, 0, 60 - n)),
  actorId: { _id: id('a'), name: 'Ahmed' },
  taskId: { _id: id('b'), title: 'Login Page' },
  ...extra,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.userFind.mockReturnValue(chain([]))
  m.taskFind.mockReturnValue(chain([]))
})

describe('listActivity', () => {
  it('returns newest first and asks the database for that order', async () => {
    const query = chain([row(1), row(2)])
    m.activityFind.mockReturnValue(query)
    const out = await listActivity({ projectId: PROJECT, viewerId: VIEWER, isEditor: true })

    expect(query.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 })
    expect(out.activities.map((a) => a.actor?.name)).toEqual(['Ahmed', 'Ahmed'])
    expect(out.activities[0].createdAt >= out.activities[1].createdAt).toBe(true)
  })

  it('returns one page and says there is more', async () => {
    const rows = Array.from({ length: ACTIVITY_PAGE_SIZE + 1 }, (_, i) => row(i + 1))
    const query = chain(rows)
    m.activityFind.mockReturnValue(query)

    const out = await listActivity({ projectId: PROJECT, viewerId: VIEWER, isEditor: true })
    expect(out.activities).toHaveLength(ACTIVITY_PAGE_SIZE)
    expect(out.hasMore).toBe(true)
    expect(query.limit).toHaveBeenCalledWith(ACTIVITY_PAGE_SIZE + 1)
  })

  it('says there is no more on the last page, and passes skip through', async () => {
    const query = chain([row(1), row(2), row(3)])
    m.activityFind.mockReturnValue(query)

    const out = await listActivity({ projectId: PROJECT, viewerId: VIEWER, isEditor: true, skip: 40, limit: 20 })
    expect(out.hasMore).toBe(false)
    expect(query.skip).toHaveBeenCalledWith(40)
  })

  it('looks up the name of the developer an entry concerns, without storing it', async () => {
    m.activityFind.mockReturnValue(chain([row(1, { type: 'TASK_ASSIGNED', metadata: { assigneeId: id('c') } })]))
    m.userFind.mockReturnValue(chain([{ _id: id('c'), name: 'Bilal' }]))

    const [entry] = (await listActivity({ projectId: PROJECT, viewerId: VIEWER, isEditor: true })).activities
    expect(entry.assignee).toEqual({ _id: id('c'), name: 'Bilal' })
    expect(activitySentence(entry)).toBe('Ahmed assigned "Login Page" to Bilal')
  })

  it('keeps an entry whose task was deleted readable', async () => {
    m.activityFind.mockReturnValue(chain([row(1, { taskId: null })]))
    const [entry] = (await listActivity({ projectId: PROJECT, viewerId: VIEWER, isEditor: true })).activities
    expect(entry.task).toBeNull()
    expect(activitySentence(entry)).toBe('Ahmed started "a deleted task"')
  })

  it('does not narrow the feed for an editor', async () => {
    m.activityFind.mockReturnValue(chain([]))
    await listActivity({ projectId: PROJECT, viewerId: VIEWER, isEditor: true })
    expect(m.activityFind.mock.calls[0][0]).toEqual({ projectId: PROJECT })
    expect(m.taskFind).not.toHaveBeenCalled()
  })

  it('narrows a developer’s feed to their own tasks and actions', async () => {
    m.taskFind.mockReturnValue(chain([{ _id: id('b') }]))
    m.activityFind.mockReturnValue(chain([]))
    await listActivity({ projectId: PROJECT, viewerId: VIEWER, isEditor: false })

    expect(m.taskFind).toHaveBeenCalledWith({ projectId: PROJECT, assignedTo: VIEWER })
    expect(m.activityFind.mock.calls[0][0].$or).toEqual([{ taskId: { $in: [id('b')] } }, { actorId: VIEWER }])
  })
})

describe('recordActivity', () => {
  it('writes one entry', async () => {
    await recordActivity({ projectId: PROJECT, actorId: VIEWER, type: 'COMMENT_ADDED' })
    expect(m.activityCreate).toHaveBeenCalledTimes(1)
  })

  it('never fails the action that triggered it', async () => {
    m.activityCreate.mockRejectedValue(new Error('db down'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(recordActivity({ projectId: PROJECT, actorId: VIEWER, type: 'COMMENT_ADDED' })).resolves.toBeUndefined()
    spy.mockRestore()
  })
})

describe('activityForMove', () => {
  it('maps each workflow move to its entry, and ignores stepping back', () => {
    expect(activityForMove('todo', 'in-progress')).toBe('TASK_STARTED')
    expect(activityForMove('in-progress', 'review')).toBe('TASK_SUBMITTED_FOR_REVIEW')
    expect(activityForMove('review', 'in-progress')).toBe('TASK_SENT_BACK')
    expect(activityForMove('review', 'complete')).toBe('TASK_COMPLETED')
    expect(activityForMove('complete', 'in-progress')).toBe('TASK_REOPENED')
    expect(activityForMove('in-progress', 'todo')).toBeNull()
  })
})

describe('activity wording', () => {
  const item = (type: ActivityItem['type'], assignee: string | null = null): ActivityItem => ({
    _id: '1',
    type,
    createdAt: '2026-10-08T12:00:00Z',
    actor: { _id: 'a', name: 'Ali' },
    task: { _id: 't', title: 'Login Page' },
    assignee: assignee ? { _id: 'b', name: assignee } : null,
  })

  it.each([
    [item('TASK_CREATED'), 'Ali created "Login Page"'],
    [item('TASK_CREATED', 'Ahmed'), 'Ali created "Login Page" and assigned it to Ahmed'],
    [item('TASK_ASSIGNED', 'Ahmed'), 'Ali assigned "Login Page" to Ahmed'],
    [item('TASK_STARTED'), 'Ali started "Login Page"'],
    [item('TASK_SUBMITTED_FOR_REVIEW'), 'Ali submitted "Login Page" for review'],
    [item('TASK_SENT_BACK', 'Ahmed'), 'Ali sent "Login Page" back to Ahmed'],
    [item('TASK_COMPLETED'), 'Ali completed "Login Page"'],
    [item('TASK_REOPENED'), 'Ali reopened "Login Page"'],
    [item('COMMENT_ADDED'), 'Ali commented on "Login Page"'],
  ])('reads naturally: %#', (entry, sentence) => {
    expect(activitySentence(entry)).toBe(sentence)
  })
})

describe('attachment wording', () => {
  const entry = (type: ActivityItem['type'], fileName?: string): ActivityItem => ({
    _id: '1',
    type,
    createdAt: '2026-10-08T12:00:00Z',
    actor: { _id: 'a', name: 'Abdullah' },
    task: { _id: 't', title: 'API Integration' },
    assignee: null,
    ...(fileName && { fileName }),
  })

  it('names the file and the task', () => {
    expect(activitySentence(entry('ATTACHMENT_ADDED', 'project-specification.pdf'))).toBe(
      'Abdullah attached "project-specification.pdf" to "API Integration"'
    )
    expect(activitySentence(entry('ATTACHMENT_DELETED', 'old.pdf'))).toBe('Abdullah removed "old.pdf" from "API Integration"')
  })

  it('copes with an entry that has no file name', () => {
    expect(activitySentence(entry('ATTACHMENT_ADDED'))).toBe('Abdullah attached "a file" to "API Integration"')
  })

  it('reads the file name back from the stored metadata, and nothing else about the file', async () => {
    m.activityFind.mockReturnValue(
      chain([row(1, { type: 'ATTACHMENT_ADDED', metadata: { fileName: 'spec.pdf' }, storageKey: 'secret/key', size: 5 })])
    )
    const [item] = (await listActivity({ projectId: PROJECT, viewerId: VIEWER, isEditor: true })).activities
    expect(item.fileName).toBe('spec.pdf')
    expect(JSON.stringify(item)).not.toContain('secret/key')
  })
})
