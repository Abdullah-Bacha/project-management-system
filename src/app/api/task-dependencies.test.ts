import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Task dependencies at the route level. The real authorization guard and the
 * real service (cycle walk, validation, counting) run; only the database is a
 * small in-memory stand-in.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    projectFindById: vi.fn(),
    teamExists: vi.fn(),
    recordActivity: vi.fn(),
    store: { tasks: [] as any[], deps: [] as any[] },
    seq: { n: 0 },
  }
})

const eq = (a: unknown, b: unknown) => String(a) === String(b)
function matches(doc: any, filter: any): boolean {
  return Object.entries(filter).every(([key, cond]: [string, any]) => {
    if (key === '$or') return cond.some((f: any) => matches(doc, f))
    if (cond && typeof cond === 'object' && '$in' in cond) return cond.$in.some((v: unknown) => eq(doc[key], v))
    return eq(doc[key], cond)
  })
}
const chain = (get: () => unknown) => {
  const q: any = {}
  for (const step of ['populate', 'sort', 'select']) q[step] = () => q
  q.lean = () => Promise.resolve(get())
  q.then = (ok: any, bad: any) => Promise.resolve(get()).then(ok, bad)
  return q
}

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/services/activity', () => ({ recordActivity: m.recordActivity }))
vi.mock('@/lib/db/models', () => ({
  Project: { findById: m.projectFindById },
  Team: { exists: m.teamExists },
  Task: {
    findById: (id: string) => chain(() => m.store.tasks.find((t) => eq(t._id, id)) ?? null),
    findOne: (f: any) => chain(() => m.store.tasks.find((t) => matches(t, f)) ?? null),
    find: (f: any) => chain(() => m.store.tasks.filter((t) => matches(t, f))),
    updateMany: vi.fn().mockResolvedValue({}),
  },
  TaskDependency: {
    find: (f: any) => chain(() => m.store.deps.filter((d) => matches(d, f))),
    exists: async (f: any) => (m.store.deps.some((d) => matches(d, f)) ? { _id: 'x' } : null),
    create: async (doc: any) => {
      if (m.store.deps.some((d) => eq(d.blockingTaskId, doc.blockingTaskId) && eq(d.blockedTaskId, doc.blockedTaskId))) {
        throw Object.assign(new Error('dup'), { code: 11000 })
      }
      const row = { _id: `d${++m.seq.n}`.padEnd(24, '0'), ...doc }
      m.store.deps.push(row)
      return row
    },
    findOneAndDelete: (f: any) =>
      chain(() => {
        const i = m.store.deps.findIndex((d) => matches(d, f))
        return i < 0 ? null : m.store.deps.splice(i, 1)[0]
      }),
    deleteMany: vi.fn(),
  },
}))

import { GET, POST } from './tasks/[id]/dependencies/route'
import { DELETE } from './tasks/[id]/dependencies/[dependencyId]/route'

const id = (c: string) => c.repeat(24)
const LEADER = id('b')
const DEV = id('c')
const OTHER_DEV = id('d')
const OUTSIDER = id('e')
const PROJECT = id('2')
const OTHER_PROJECT = id('9')
const A = id('1')
const B = id('3')
const C = id('4')
const D = id('5')
const FOREIGN = id('6') // a task in another project

const project = { _id: PROJECT, title: 'P', owner: id('a'), team: id('7'), members: [id('a'), LEADER, DEV, OTHER_DEV] }

const task = (_id: string, title: string, extra: Record<string, unknown> = {}) => ({
  _id,
  title,
  projectId: PROJECT,
  status: 'todo',
  priority: 'medium',
  assignedTo: null,
  ...extra,
})

const as = (userId: string | null, { leader = false } = {}) => {
  m.authenticate.mockResolvedValue(userId ? { user: { userId, role: 'developer' }, error: null } : { user: null, error: 'Unauthorized' })
  m.teamExists.mockResolvedValue(leader ? { _id: id('7') } : null)
}
const ctx = (taskId: string, dependencyId = '') => ({ params: Promise.resolve({ id: taskId, dependencyId }) })
const req = (taskId: string, method = 'GET', body?: unknown, extra = '') =>
  new NextRequest(`http://localhost/api/tasks/${taskId}/dependencies${extra}`, {
    method,
    ...(body !== undefined && { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
  })
const list = (taskId: string) => GET(req(taskId), ctx(taskId))
const add = (blocked: string, blocking: unknown) => POST(req(blocked, 'POST', { blockingTaskId: blocking }), ctx(blocked))
const del = (taskId: string, depId: string) => DELETE(req(taskId, 'DELETE', undefined, `/${depId}`), ctx(taskId, depId))
const edges = () => m.store.deps.map((d) => `${d.blockingTaskId}>${d.blockedTaskId}`)

beforeEach(() => {
  vi.clearAllMocks()
  m.seq.n = 0
  m.store.tasks = [
    task(A, 'A', { assignedTo: DEV }),
    task(B, 'B', { assignedTo: OTHER_DEV }),
    task(C, 'C'),
    task(D, 'D'),
    task(FOREIGN, 'Foreign', { projectId: OTHER_PROJECT }),
  ]
  m.store.deps = []
  m.projectFindById.mockImplementation(async (pid: string) => (String(pid) === PROJECT ? project : null))
})


describe('who can ask', () => {
  it('signed-out callers get 401 on every route', async () => {
    as(null)
    expect((await list(A)).status).toBe(401)
    expect((await add(A, B)).status).toBe(401)
    expect((await del(A, id('f'))).status).toBe(401)
  })

  it('a non-member gets 404 and learns nothing', async () => {
    as(OUTSIDER)
    expect((await list(A)).status).toBe(404)
    expect((await add(A, B)).status).toBe(404)
    expect(m.store.deps).toHaveLength(0)
  })

  it('a malformed task id is 400', async () => {
    as(LEADER, { leader: true })
    expect((await list('nope')).status).toBe(400)
  })

  it('a developer can read the dependencies of their own task only', async () => {
    as(DEV)
    expect((await list(A)).status).toBe(200)
    expect((await list(B)).status).toBe(403) // a teammate's task
  })

  it('a developer cannot add or remove, not even on their own task', async () => {
    as(DEV)
    expect((await add(A, C)).status).toBe(403)
    m.store.deps.push({ _id: id('f'), projectId: PROJECT, blockingTaskId: C, blockedTaskId: A })
    expect((await del(A, id('f'))).status).toBe(403)
    expect(m.store.deps).toHaveLength(1)
  })

  it('a team leader can add, read and remove', async () => {
    as(LEADER, { leader: true })
    const res = await add(B, A)
    expect(res.status).toBe(201)
    const { dependency } = await res.json()
    expect((await list(B)).status).toBe(200)
    expect((await del(B, dependency._id)).status).toBe(200)
    expect(m.store.deps).toHaveLength(0)
  })

  it('the project owner can add', async () => {
    m.authenticate.mockResolvedValue({ user: { userId: project.owner, role: 'admin' }, error: null })
    m.teamExists.mockResolvedValue(null)
    expect((await add(B, A)).status).toBe(201)
  })
})

describe('validation', () => {
  beforeEach(() => as(LEADER, { leader: true }))

  it('a task cannot depend on itself', async () => {
    const res = await add(A, A)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('A task cannot depend on itself.')
  })

  it('a duplicate is rejected, and stored once', async () => {
    expect((await add(B, A)).status).toBe(201)
    const again = await add(B, A)
    expect(again.status).toBe(400)
    expect((await again.json()).error).toBe('This dependency already exists.')
    expect(m.store.deps).toHaveLength(1)
  })

  it('two identical requests racing: the unique index decides, the loser gets a 400', async () => {
    // Both pass the pre-check, only one insert survives.
    const [x, y] = await Promise.all([add(B, A), add(B, A)])
    expect([x.status, y.status].sort()).toEqual([201, 400])
    expect(m.store.deps).toHaveLength(1)
  })

  it('a task from another project (or none) is rejected alike', async () => {
    const other = await add(A, FOREIGN)
    const missing = await add(A, id('8'))
    expect(other.status).toBe(400)
    expect(missing.status).toBe(400)
    expect((await other.json()).error).toBe((await missing.json()).error)
    expect(m.store.deps).toHaveLength(0)
  })

  it.each([[{}], [{ blockingTaskId: 'abc' }], [{ blockingTaskId: { $ne: null } }], [{ blockingTaskId: 5 }]])('rejects body %j', async (body) => {
    const res = await POST(req(A, 'POST', body), ctx(A))
    expect(res.status).toBe(400)
  })
})

describe('circular dependencies', () => {
  beforeEach(() => as(LEADER, { leader: true }))

  it('rejects the reverse of an existing dependency (A→B then B→A)', async () => {
    expect((await add(B, A)).status).toBe(201) // A blocks B
    const res = await add(A, B) // B blocks A
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('This dependency would create a circular dependency.')
  })

  it('rejects A→B, B→C, C→A', async () => {
    expect((await add(B, A)).status).toBe(201)
    expect((await add(C, B)).status).toBe(201)
    expect((await add(A, C)).status).toBe(400)
  })

  it('rejects a four-task loop A→B→C→D→A', async () => {
    expect((await add(B, A)).status).toBe(201)
    expect((await add(C, B)).status).toBe(201)
    expect((await add(D, C)).status).toBe(201)
    expect((await add(A, D)).status).toBe(400)
    expect(m.store.deps).toHaveLength(3)
  })

  it('allows a valid chain and a task with several blockers', async () => {
    expect((await add(B, A)).status).toBe(201)
    expect((await add(C, B)).status).toBe(201)
    expect((await add(D, C)).status).toBe(201)
    expect((await add(D, A)).status).toBe(201) // a second route to D is not a loop
    expect((await add(D, B)).status).toBe(201)
  })

  it('terminates on data that already contains a loop', async () => {
    m.store.deps.push(
      { _id: id('f'), projectId: PROJECT, blockingTaskId: B, blockedTaskId: C },
      { _id: id('e'), projectId: PROJECT, blockingTaskId: C, blockedTaskId: B }
    )
    expect((await add(D, B)).status).toBe(201)
  })
})

describe('reading and removing', () => {
  it('returns both sides with only summary fields, and counts unresolved blockers', async () => {
    as(LEADER, { leader: true })
    m.store.tasks.find((t) => t._id === C)!.status = 'complete'
    await add(B, A)
    await add(B, C)
    await add(D, B)

    const body = await (await list(B)).json()
    expect(body.blockedBy.map((e: any) => e.task.title).sort()).toEqual(['A', 'C'])
    expect(body.blocks.map((e: any) => e.task.title)).toEqual(['D'])
    expect(body.unresolved).toBe(1) // A is open, C is Complete
    expect(Object.keys(body.blockedBy[0].task).sort()).toEqual(['_id', 'assignee', 'priority', 'status', 'title'])
  })

  it('removing a dependency removes it from both sides', async () => {
    as(LEADER, { leader: true })
    const { dependency } = await (await add(B, A)).json()
    expect((await del(B, dependency._id)).status).toBe(200)
    expect((await (await list(A)).json()).blocks).toEqual([])
    expect((await (await list(B)).json()).blockedBy).toEqual([])
  })

  it('cannot remove a dependency through a task it does not belong to (IDOR)', async () => {
    as(LEADER, { leader: true })
    const { dependency } = await (await add(B, A)).json()
    const res = await del(C, dependency._id)
    expect(res.status).toBe(404)
    expect(m.store.deps).toHaveLength(1)
  })

  it('cannot reach another project through a task id from it', async () => {
    as(LEADER, { leader: true })
    expect((await list(FOREIGN)).status).toBe(404)
    expect((await add(FOREIGN, A)).status).toBe(404)
  })

  it('a malformed dependency id is 400', async () => {
    as(LEADER, { leader: true })
    expect((await del(A, 'nope')).status).toBe(400)
  })
})

describe('activity', () => {
  beforeEach(() => as(LEADER, { leader: true }))

  it('one entry per successful add, naming the blocked task and the blocker', async () => {
    await add(B, A)
    expect(m.recordActivity).toHaveBeenCalledTimes(1)
    const call = m.recordActivity.mock.calls[0][0]
    expect(call).toMatchObject({ type: 'DEPENDENCY_ADDED', actorId: LEADER, taskId: B })
    expect(String(call.metadata.relatedTaskId)).toBe(A)
  })

  it('one entry per successful removal', async () => {
    const { dependency } = await (await add(B, A)).json()
    m.recordActivity.mockClear()
    await del(B, dependency._id)
    expect(m.recordActivity).toHaveBeenCalledTimes(1)
    expect(m.recordActivity.mock.calls[0][0]).toMatchObject({ type: 'DEPENDENCY_REMOVED', taskId: B })
  })

  it('failed operations, reads and refusals record nothing', async () => {
    await add(A, A)
    await add(A, FOREIGN)
    await list(A)
    await del(A, id('f'))
    as(DEV)
    await add(A, C)
    expect(m.recordActivity).not.toHaveBeenCalled()
  })
})
