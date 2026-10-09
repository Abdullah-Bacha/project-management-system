import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * The comment endpoints must apply the same rule as GET /api/tasks/:id: a
 * developer reaches only the tasks assigned to them; the project owner and the
 * team's leader reach any task in their project. Unlike the other route tests,
 * the real authorization guard runs here (only the database and the caller's
 * identity are stubbed).
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    taskFindById: vi.fn(),
    projectFindById: vi.fn(),
    teamExists: vi.fn(),
    commentFind: vi.fn(),
    commentCount: vi.fn(),
    commentCreate: vi.fn(),
    emit: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Task: { findById: m.taskFindById },
  Project: { findById: m.projectFindById },
  Team: { exists: m.teamExists },
  Comment: { find: m.commentFind, countDocuments: m.commentCount, create: m.commentCreate },
}))
vi.mock('@/lib/services/notifications', () => ({ emitNotification: m.emit }))

import { GET as listComments, POST as addComment } from './tasks/[id]/comments/route'

const id = (c: string) => c.repeat(24)
const OWNER = id('a')
const LEADER = id('b')
const DEV = id('c')
const OTHER_DEV = id('d')
const OUTSIDER = id('e')
const TASK = id('1')
const PROJECT = id('2')

const project = { _id: PROJECT, title: 'P', owner: OWNER, team: id('3'), members: [OWNER, LEADER, DEV, OTHER_DEV] }
const task = { _id: TASK, title: 'T', projectId: PROJECT, assignedTo: DEV, createdBy: LEADER }

const params = { params: Promise.resolve({ id: TASK }) }
const get = () => listComments(new NextRequest(`http://localhost/api/tasks/${TASK}/comments`), params)
const post = () =>
  addComment(
    new NextRequest(`http://localhost/api/tasks/${TASK}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'hello' }),
    }),
    params
  )

const as = (userId: string, { leader = false } = {}) => {
  m.authenticate.mockResolvedValue({ user: { userId, role: 'developer' }, error: null })
  m.teamExists.mockResolvedValue(leader ? { _id: id('3') } : null)
}

const chain = (value: unknown) => {
  const q: any = {}
  for (const step of ['populate', 'sort', 'skip', 'limit']) q[step] = () => q
  q.then = (ok: any) => ok(value)
  return q
}

beforeEach(() => {
  vi.resetAllMocks()
  m.taskFindById.mockImplementation(() => chain(task))
  m.projectFindById.mockResolvedValue(project)
  m.commentFind.mockReturnValue(chain([]))
  m.commentCount.mockResolvedValue(0)
  m.commentCreate.mockResolvedValue({ populate: vi.fn() })
})

describe('a developer and their own task', () => {
  it('can read its comments', async () => {
    as(DEV)
    expect((await get()).status).toBe(200)
  })

  it('can add a comment', async () => {
    as(DEV)
    expect((await post()).status).toBe(201)
    expect(m.commentCreate).toHaveBeenCalled()
  })
})

describe('a developer and a teammate’s task', () => {
  it('cannot read its comments (403)', async () => {
    as(OTHER_DEV)
    expect((await get()).status).toBe(403)
    expect(m.commentFind).not.toHaveBeenCalled()
  })

  it('cannot add a comment (403) and nothing is written or sent', async () => {
    as(OTHER_DEV)
    expect((await post()).status).toBe(403)
    expect(m.commentCreate).not.toHaveBeenCalled()
    expect(m.emit).not.toHaveBeenCalled()
  })
})

describe('people outside the project', () => {
  it('get 404 on both, so the task id is not confirmed to exist', async () => {
    as(OUTSIDER)
    expect((await get()).status).toBe(404)
    expect((await post()).status).toBe(404)
  })
})

describe('the people who manage the project keep their access', () => {
  it('the owner can read and comment', async () => {
    as(OWNER)
    expect((await get()).status).toBe(200)
    expect((await post()).status).toBe(201)
  })

  it('the leader of the project’s team can read and comment on any task', async () => {
    as(LEADER, { leader: true })
    expect((await get()).status).toBe(200)
    expect((await post()).status).toBe(201)
  })
})
