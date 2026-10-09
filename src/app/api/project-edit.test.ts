import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** Editing a project: dates (set, change, clear), status, links, and who may. */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return { authenticate: vi.fn(), update: vi.fn(), findById: vi.fn(), teamExists: vi.fn() }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Project: { findByIdAndUpdate: m.update, findById: m.findById },
  Team: { exists: m.teamExists },
  Task: {},
}))
vi.mock('@/lib/services/projects', () => ({ PROJECT_POPULATE: [], deleteProjectCascade: vi.fn() }))

import { PUT } from './projects/[id]/route'

const id = (c: string) => c.repeat(24)
const OWNER = id('a')
const LEADER = id('b')
const DEV = id('c')
const OUTSIDER = id('d')
const PROJECT = id('1')

let stored: Record<string, unknown>

const as = (userId: string, role: string) =>
  m.authenticate.mockResolvedValue({ user: { userId, role, status: 'active', email: `${role}@example.com` }, error: null })
const chain = (value: unknown) => {
  const q: any = {}
  q.populate = () => q
  q.then = (ok: any, bad: any) => Promise.resolve(value).then(ok, bad)
  return q
}
const put = (body: unknown) =>
  PUT(new NextRequest(`http://localhost/api/projects/${PROJECT}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), {
    params: Promise.resolve({ id: PROJECT }),
  })

beforeEach(() => {
  vi.resetAllMocks()
  as(OWNER, 'admin')
  stored = { _id: PROJECT, owner: OWNER, members: [OWNER, LEADER, DEV], team: id('7'), startDate: new Date('2026-11-01T00:00:00Z'), deadline: new Date('2026-12-01T00:00:00Z') }
  m.findById.mockImplementation(() => chain(stored))
  m.update.mockImplementation(() => chain({ _id: PROJECT, title: 'Site' }))
  m.teamExists.mockImplementation(async (f: any) => (f.teamLeader === LEADER ? { _id: 'x' } : null))
})

describe('editing dates', () => {
  it('sets title, status, requirements and dates with $set', async () => {
    expect((await put({ title: 'New name', status: 'completed', requirements: 'r', startDate: '2026-10-01', deadline: '2026-10-20' })).status).toBe(200)
    expect(m.update.mock.calls[0][1]).toEqual({ $set: { title: 'New name', status: 'completed', requirements: 'r', startDate: '2026-10-01', deadline: '2026-10-20' } })
  })

  it('null clears a date with $unset and leaves the other alone', async () => {
    expect((await put({ deadline: null })).status).toBe(200)
    expect(m.update.mock.calls[0][1]).toEqual({ $unset: { deadline: 1 } })
    expect((await put({ startDate: null, title: 'Keep going' })).status).toBe(200)
    expect(m.update.mock.calls[1][1]).toEqual({ $set: { title: 'Keep going' }, $unset: { startDate: 1 } })
  })

  it('a deadline before the start is refused, as sent or against what is stored', async () => {
    expect((await put({ startDate: '2026-10-10', deadline: '2026-10-01' })).status).toBe(400)
    expect((await put({ deadline: '2026-10-15' })).status).toBe(400) // stored start is 2026-11-01
    expect((await put({ startDate: '2027-01-01' })).status).toBe(400) // stored deadline is 2026-12-01
    expect(m.update).not.toHaveBeenCalled()
  })

  it('moving both dates together is fine, and clearing the start frees the deadline', async () => {
    expect((await put({ startDate: '2027-01-01', deadline: '2027-02-01' })).status).toBe(200)
    expect((await put({ startDate: null, deadline: '2026-10-15' })).status).toBe(200)
  })

  it.each([['an impossible start date', { startDate: '2026-02-30' }], ['a non-date start', { startDate: 'soon' }], ['an operator', { startDate: { $ne: null } }], ['a bad status', { status: 'deleted' }], ['a short title', { title: 'ab' }]])(
    'rejects %s',
    async (_l, body) => {
      expect((await put(body)).status).toBe(400)
      expect(m.update).not.toHaveBeenCalled()
    }
  )

  it('cannot change ownership, members or progress through this route', async () => {
    await put({ title: 'Safe title', owner: OUTSIDER, members: [OUTSIDER], progress: 100, team: id('9') })
    expect(m.update.mock.calls[0][1]).toEqual({ $set: { title: 'Safe title' } })
  })
})

describe('who may edit', () => {
  it('the team leader may; a developer on the project may not; an outsider does not even see it', async () => {
    as(LEADER, 'team_leader')
    expect((await put({ title: 'Leader edit' })).status).toBe(200)
    as(DEV, 'developer')
    expect((await put({ title: 'Dev edit' })).status).toBe(403)
    as(OUTSIDER, 'admin')
    expect((await put({ title: 'Outsider edit' })).status).toBe(404)
    expect(m.update).toHaveBeenCalledTimes(1)
  })

  it('signed-out callers get 401', async () => {
    m.authenticate.mockResolvedValue({ user: null, error: 'Unauthorized' })
    expect((await put({ title: 'Nope nope' })).status).toBe(401)
  })
})
