import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Presence at the route level: who a heartbeat counts for, who may close a tab,
 * and who may see the answer. Only the database and the caller are stubbed.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    sessExists: vi.fn(),
    sessCount: vi.fn(),
    sessUpdate: vi.fn(),
    sessFind: vi.fn(),
    userUpdate: vi.fn(),
    userFind: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  PresenceSession: { exists: m.sessExists, countDocuments: m.sessCount, updateOne: m.sessUpdate, find: m.sessFind },
  User: { updateOne: m.userUpdate, find: m.userFind },
}))

import { POST as beatPOST } from './presence/route'
import { POST as leavePOST } from './presence/leave/route'
import { GET as adminGET } from './admin/presence/route'

const id = (c: string) => c.repeat(24)
const ME = id('a')
const OTHER = id('b')
const ADMIN = id('c')
const TAB = '3f2b8a1c-1111-4222-8333-444455556666'

const as = (userId: string | null, role = 'developer') =>
  m.authenticate.mockResolvedValue(userId ? { user: { userId, role, status: 'active', email: `${role}@example.com` }, error: null } : { user: null, error: 'Unauthorized' })

const post = (handler: typeof beatPOST, body: unknown) =>
  handler(new NextRequest('http://localhost/api/presence', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))
const report = () => adminGET(new NextRequest('http://localhost/api/admin/presence'))

const chain = (value: unknown) => {
  const q: any = { select: () => q, lean: () => Promise.resolve(value) }
  return q
}

beforeEach(() => {
  vi.resetAllMocks()
  as(ME)
  m.sessExists.mockResolvedValue({ _id: 'x' })
  m.sessCount.mockResolvedValue(0)
  m.sessUpdate.mockResolvedValue({ modifiedCount: 1 })
  m.userUpdate.mockResolvedValue({})
})

describe('heartbeat: a tab says "still here"', () => {
  it('registers the tab for the person the token names', async () => {
    const res = await post(beatPOST, { tabId: TAB })
    expect(res.status).toBe(200)
    const [filter, update, options] = m.sessUpdate.mock.calls[0]
    expect(filter).toEqual({ userId: ME, tabId: TAB })
    expect(options).toEqual({ upsert: true })
    expect(update.$set.lastBeatAt).toBeInstanceOf(Date)
    expect(update.$unset).toEqual({ leftAt: 1 }) // a refreshed tab is the same tab, open again
    expect(m.userUpdate.mock.calls[0][0]).toEqual({ _id: ME })
    expect(m.userUpdate.mock.calls[0][1].$set.lastSeenAt).toBeInstanceOf(Date)
    // Being seen is not an edit of the account: `updatedAt` must not move.
    expect(m.userUpdate.mock.calls[0][2]).toEqual({ timestamps: false })
  })

  it('ignores any user id in the request: nobody can report someone else as online', async () => {
    await post(beatPOST, { tabId: TAB, userId: OTHER, user: OTHER, _id: OTHER })
    expect(m.sessUpdate.mock.calls[0][0].userId).toBe(ME)
    expect(m.userUpdate.mock.calls[0][0]._id).toBe(ME)
    expect(JSON.stringify(m.sessUpdate.mock.calls)).not.toContain(OTHER)
  })

  it('signed-out callers get 401 and nothing is written', async () => {
    as(null)
    expect((await post(beatPOST, { tabId: TAB })).status).toBe(401)
    expect(m.sessUpdate).not.toHaveBeenCalled()
    expect(m.userUpdate).not.toHaveBeenCalled()
  })

  it.each([[{}], [{ tabId: '' }], [{ tabId: 'short' }], [{ tabId: '../../x' }], [{ tabId: { $ne: null } }], [{ tabId: 12345678 }]])('rejects the body %j with 400', async (body) => {
    expect((await post(beatPOST, body)).status).toBe(400)
    expect(m.sessUpdate).not.toHaveBeenCalled()
  })

  it('a brand-new tab is refused past the per-person limit; a known tab always may report', async () => {
    m.sessExists.mockResolvedValue(null)
    m.sessCount.mockResolvedValue(25)
    expect((await post(beatPOST, { tabId: TAB })).status).toBe(429)
    expect(m.sessUpdate).not.toHaveBeenCalled()

    m.sessExists.mockResolvedValue({ _id: 'x' })
    expect((await post(beatPOST, { tabId: TAB })).status).toBe(200)
  })

  it('works for every role (everyone reports their own tab)', async () => {
    for (const role of ['admin', 'team_leader', 'developer']) {
      as(ME, role)
      expect((await post(beatPOST, { tabId: TAB })).status).toBe(200)
    }
  })
})

describe('leave: a tab says goodbye', () => {
  it('closes only the caller\'s own tab', async () => {
    const res = await post(leavePOST, { tabId: TAB, userId: OTHER })
    expect(res.status).toBe(200)
    const [filter, update] = m.sessUpdate.mock.calls[0]
    expect(filter).toMatchObject({ userId: ME, tabId: TAB })
    expect(JSON.stringify(filter)).not.toContain(OTHER)
    expect(update.$set.leftAt).toBeInstanceOf(Date)
  })

  it('records the last-seen time when it closed something, and not when there was nothing to close', async () => {
    await post(leavePOST, { tabId: TAB })
    expect(m.userUpdate).toHaveBeenCalledTimes(1)
    expect(m.userUpdate.mock.calls[0][2]).toEqual({ timestamps: false })
    m.userUpdate.mockClear()
    m.sessUpdate.mockResolvedValue({ modifiedCount: 0 })
    await post(leavePOST, { tabId: TAB })
    expect(m.userUpdate).not.toHaveBeenCalled()
  })

  it('401 when signed out, 400 for a bad tab id', async () => {
    as(null)
    expect((await post(leavePOST, { tabId: TAB })).status).toBe(401)
    as(ME)
    expect((await post(leavePOST, { tabId: 'x' })).status).toBe(400)
    expect(m.sessUpdate).not.toHaveBeenCalled()
  })
})

describe('admin view', () => {
  const NOW = Date.now()
  beforeEach(() => {
    as(ADMIN, 'admin')
    m.userFind.mockImplementation(() =>
      chain([
        { _id: ME, lastSeenAt: new Date(NOW - 5_000) },
        { _id: OTHER, lastSeenAt: new Date('2026-10-01T08:00:00Z') },
        { _id: ADMIN },
      ])
    )
    m.sessFind.mockImplementation(() => chain([{ userId: ME, lastBeatAt: new Date(NOW - 3_000) }]))
  })

  it('only administrators may look (403 for everyone else, 401 signed out)', async () => {
    for (const role of ['developer', 'team_leader']) {
      as(ME, role)
      expect((await report()).status).toBe(403)
    }
    as(null)
    expect((await report()).status).toBe(401)
    expect(m.sessFind).not.toHaveBeenCalled()
    expect(m.userFind).not.toHaveBeenCalled()
  })

  it('reports online, offline, last seen (UTC) and the totals', async () => {
    const res = await report()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    const by = Object.fromEntries(body.users.map((u: any) => [u._id, u]))
    expect(by[ME]).toMatchObject({ online: true })
    expect(by[OTHER]).toEqual({ _id: OTHER, online: false, lastSeenAt: '2026-10-01T08:00:00.000Z' })
    expect(by[ADMIN]).toEqual({ _id: ADMIN, online: false, lastSeenAt: null }) // never seen
    expect(body.counts).toEqual({ online: 1, offline: 2 })
  })

  it('asks the database only for tabs that could still be connected', async () => {
    await report()
    const filter = m.sessFind.mock.calls[0][0]
    expect(filter.$or).toHaveLength(2)
    expect(JSON.stringify(filter)).toContain('leftAt')
  })

  it('shares no email, token or other account data', async () => {
    const text = JSON.stringify(await (await report()).json())
    expect(text).not.toMatch(/email|password|token|name/i)
  })

  it('everyone offline gives zero online', async () => {
    m.sessFind.mockImplementation(() => chain([]))
    expect((await (await report()).json()).counts).toEqual({ online: 0, offline: 3 })
  })
})
