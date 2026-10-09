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
    sessFindOne: vi.fn(),
    shareTeam: vi.fn(),
    userFindById: vi.fn(),
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
  PresenceSession: { findOne: m.sessFindOne, countDocuments: m.sessCount, updateOne: m.sessUpdate, find: m.sessFind },
  User: { updateOne: m.userUpdate, find: m.userFind, findById: m.userFindById },
}))
vi.mock('@/lib/services/teammates', () => ({ shareTeam: m.shareTeam }))

import { POST as beatPOST } from './presence/route'
import { POST as leavePOST } from './presence/leave/route'
import { GET as adminGET } from './admin/presence/route'
import { GET as peerGET } from './presence/user/[userId]/route'

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
  m.sessFindOne.mockImplementation(() => chain({ lastBeatAt: new Date(), startedAt: new Date(Date.now() - 600_000) }))
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
    m.sessFindOne.mockImplementation(() => chain(null))
    m.sessCount.mockResolvedValue(25)
    expect((await post(beatPOST, { tabId: TAB })).status).toBe(429)
    expect(m.sessUpdate).not.toHaveBeenCalled()

    m.sessFindOne.mockImplementation(() => chain({ lastBeatAt: new Date(), startedAt: new Date() }))
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

describe('"active since": when a tab\'s stretch of being online began', () => {
  const startedAtOf = () => m.sessUpdate.mock.calls[0][1].$set.startedAt

  it('a brand-new tab starts now', async () => {
    m.sessFindOne.mockImplementation(() => chain(null))
    await post(beatPOST, { tabId: TAB })
    expect(startedAtOf()).toBeInstanceOf(Date)
  })

  it('a tab that kept reporting keeps its start (it is not moved forward on every heartbeat)', async () => {
    await post(beatPOST, { tabId: TAB })
    expect(startedAtOf()).toBeUndefined()
  })

  it('a tab that was gone for a long time and comes back starts again from now', async () => {
    m.sessFindOne.mockImplementation(() => chain({ lastBeatAt: new Date(Date.now() - 10 * 60_000), startedAt: new Date(Date.now() - 3 * 3_600_000) }))
    await post(beatPOST, { tabId: TAB })
    expect(startedAtOf()).toBeInstanceOf(Date)
  })

  it('a tab that said goodbye (more than the refresh grace ago) and returns starts again from now', async () => {
    m.sessFindOne.mockImplementation(() => chain({ lastBeatAt: new Date(Date.now() - 60_000), leftAt: new Date(Date.now() - 50_000), startedAt: new Date(Date.now() - 3_600_000) }))
    await post(beatPOST, { tabId: TAB })
    expect(startedAtOf()).toBeInstanceOf(Date)
  })

  it('a refresh (goodbye, then straight back) keeps the start', async () => {
    m.sessFindOne.mockImplementation(() => chain({ lastBeatAt: new Date(Date.now() - 3_000), leftAt: new Date(Date.now() - 2_000), startedAt: new Date(Date.now() - 3_600_000) }))
    await post(beatPOST, { tabId: TAB })
    expect(startedAtOf()).toBeUndefined()
  })

  it('an old record without a start gets one', async () => {
    m.sessFindOne.mockImplementation(() => chain({ lastBeatAt: new Date() }))
    await post(beatPOST, { tabId: TAB })
    expect(startedAtOf()).toBeInstanceOf(Date)
  })
})

describe('a teammate\'s status (chat screen)', () => {
  const ask = (target: string) => peerGET(new NextRequest(`http://localhost/api/presence/user/${target}`), { params: Promise.resolve({ userId: target }) })
  const NOW = Date.now()

  beforeEach(() => {
    m.shareTeam.mockResolvedValue(true)
    m.userFindById.mockImplementation(() => chain({ lastSeenAt: new Date('2026-10-08T09:41:00Z') }))
    m.sessFind.mockImplementation(() => chain([]))
  })

  it('online: connected tab, and since when', async () => {
    m.sessFind.mockImplementation(() => chain([{ lastBeatAt: new Date(NOW - 2_000), startedAt: new Date(NOW - 900_000) }, { lastBeatAt: new Date(NOW - 1_000), startedAt: new Date(NOW - 300_000) }]))
    const body = await (await ask(OTHER)).json()
    expect(body.online).toBe(true)
    expect(body.activeSince).toBe(new Date(NOW - 900_000).toISOString()) // the earliest of their open tabs
    expect(body.lastSeenAt).toBe('2026-10-08T09:41:00.000Z')
  })

  it('offline: no connected tab, with the last-seen time', async () => {
    const body = await (await ask(OTHER)).json()
    expect(body).toEqual({ online: false, lastSeenAt: '2026-10-08T09:41:00.000Z', activeSince: null })
  })

  it('a tab that stopped reporting does not count as online', async () => {
    m.sessFind.mockImplementation(() => chain([{ lastBeatAt: new Date(NOW - 10 * 60_000), startedAt: new Date(NOW - 3_600_000) }]))
    expect((await (await ask(OTHER)).json()).online).toBe(false)
  })

  it('never seen: offline with no time', async () => {
    m.userFindById.mockImplementation(() => chain({}))
    expect(await (await ask(OTHER)).json()).toEqual({ online: false, lastSeenAt: null, activeSince: null })
  })

  it('only teammates may look; anyone else (or yourself) gets 404 and nothing is read', async () => {
    m.shareTeam.mockResolvedValue(false)
    expect((await ask(OTHER)).status).toBe(404)
    m.shareTeam.mockResolvedValue(true)
    expect((await ask(ME)).status).toBe(404)
    expect(m.sessFind).not.toHaveBeenCalled()
    expect(m.shareTeam).toHaveBeenCalledWith(ME, OTHER)
  })

  it('401 signed out, 400 for a bad id', async () => {
    expect((await ask('abc')).status).toBe(400)
    as(null)
    expect((await ask(OTHER)).status).toBe(401)
  })

  it('shares no email or other account data', async () => {
    const text = JSON.stringify(await (await ask(OTHER)).json())
    expect(text).not.toMatch(/email|password|token|name|role/i)
  })
})
