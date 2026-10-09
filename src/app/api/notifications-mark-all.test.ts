import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * "Mark all as read" at the route level. Only the database and the caller are
 * stubbed, so the real scoping and response logic run.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return { authenticate: vi.fn(), updateMany: vi.fn(), count: vi.fn(), findOneAndUpdate: vi.fn() }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Notification: { updateMany: m.updateMany, countDocuments: m.count, findOneAndUpdate: m.findOneAndUpdate },
}))

import { PUT as markAll } from './notifications/route'
import { PUT as markOne } from './notifications/[id]/read/route'

const id = (c: string) => c.repeat(24)
const USER_A = id('a')
const USER_B = id('b')

const as = (userId: string | null) =>
  m.authenticate.mockResolvedValue(userId ? { user: { userId, role: 'developer', status: 'active', email: 'x@example.com' }, error: null } : { user: null, error: 'Unauthorized' })
const put = (body: unknown = {}) =>
  markAll(new NextRequest('http://localhost/api/notifications', { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }))

beforeEach(() => {
  vi.resetAllMocks()
  as(USER_A)
  m.updateMany.mockResolvedValue({ modifiedCount: 3 })
  m.count.mockResolvedValue(0)
})

describe('PUT /api/notifications (mark all as read)', () => {
  it('marks only the signed-in person\'s unread notifications, and only sets the read flag', async () => {
    const res = await put()
    expect(res.status).toBe(200)
    const [filter, update] = m.updateMany.mock.calls[0]
    expect(filter).toEqual({ userId: USER_A, read: false }) // theirs, unread only: read ones are not touched
    expect(update).toEqual({ read: true }) // nothing is deleted or rewritten
  })

  it('answers how many were marked and how many are still unread', async () => {
    m.count.mockResolvedValue(1) // one arrived while this ran: it stays unread
    const body = await (await put()).json()
    expect(body).toMatchObject({ updated: 3, unreadCount: 1 })
    expect(m.count.mock.calls[0][0]).toEqual({ userId: USER_A, read: false })
  })

  it('user B cannot mark user A\'s notifications: a user id in the request is ignored', async () => {
    as(USER_B)
    await put({ userId: USER_A, user: USER_A, _id: USER_A, read: false })
    expect(m.updateMany.mock.calls[0][0]).toEqual({ userId: USER_B, read: false })
    expect(JSON.stringify(m.updateMany.mock.calls)).not.toContain(USER_A)
    expect(JSON.stringify(m.count.mock.calls)).not.toContain(USER_A)
  })

  it('with nothing unread it is a successful no-op', async () => {
    m.updateMany.mockResolvedValue({ modifiedCount: 0 })
    const res = await put()
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ updated: 0, unreadCount: 0 })
  })

  it('is safe to repeat: the second call finds nothing to do', async () => {
    m.updateMany.mockResolvedValueOnce({ modifiedCount: 2 }).mockResolvedValueOnce({ modifiedCount: 0 })
    expect((await (await put()).json()).updated).toBe(2)
    expect((await (await put()).json()).updated).toBe(0)
  })

  it('signed-out or expired callers get 401 and nothing is written', async () => {
    as(null)
    expect((await put()).status).toBe(401)
    expect(m.updateMany).not.toHaveBeenCalled()
  })

  it('a database failure is a 500, not a false success', async () => {
    m.updateMany.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await put()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Internal server error' })
  })
})

describe('marking a single notification still works, and stays scoped to its owner', () => {
  const one = (userId: string, nid: string) => {
    as(userId)
    return markOne(new NextRequest(`http://localhost/api/notifications/${nid}/read`, { method: 'PUT' }), { params: Promise.resolve({ id: nid }) })
  }

  it('marks one of the caller\'s own', async () => {
    m.findOneAndUpdate.mockResolvedValue({ _id: id('1'), read: true })
    expect((await one(USER_A, id('1'))).status).toBe(200)
    expect(m.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: id('1'), userId: USER_A })
  })

  it('another person\'s notification is a 404', async () => {
    m.findOneAndUpdate.mockResolvedValue(null)
    expect((await one(USER_B, id('1'))).status).toBe(404)
    expect(m.findOneAndUpdate.mock.calls[0][0]).toEqual({ _id: id('1'), userId: USER_B })
  })
})
