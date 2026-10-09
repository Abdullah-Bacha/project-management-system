import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** Editing an account: what an admin may change, and what is refused. */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return { authenticate: vi.fn(), update: vi.fn(), findById: vi.fn(), count: vi.fn() }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({ User: { findByIdAndUpdate: m.update, findById: m.findById, countDocuments: m.count } }))

import { PUT } from './admin/users/[id]/route'

const id = (c: string) => c.repeat(24)
const ADMIN = id('a')
const TARGET = id('1')
const PHOTO = 'data:image/png;base64,iVBORw0KGgo='

const as = (userId: string, role = 'admin', email = 'boss@example.com') =>
  m.authenticate.mockResolvedValue({ user: { userId, role, status: 'active', email }, error: null })

const put = (target: string, body: unknown) =>
  PUT(new NextRequest(`http://localhost/api/admin/users/${target}`, { method: 'PUT', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), {
    params: Promise.resolve({ id: target }),
  })

beforeEach(() => {
  vi.resetAllMocks()
  as(ADMIN)
  m.update.mockImplementation(() => ({ select: async () => ({ _id: TARGET, name: 'Sara', role: 'developer', status: 'active' }) }))
})

describe('edit a user', () => {
  it('updates name, contact number and photo, and only those', async () => {
    const res = await put(TARGET, { name: 'Sara Khan', phone: '+92 300 1', profilePicture: PHOTO, createdBy: 'x', password: 'hacked', email: 'new@x.com', tokenVersion: 99 })
    expect(res.status).toBe(200)
    expect(m.update.mock.calls[0][1]).toEqual({ name: 'Sara Khan', phone: '+92 300 1', profilePicture: PHOTO }) // email, password, token version are not editable here
  })

  it('an empty photo removes it', async () => {
    expect((await put(TARGET, { profilePicture: '' })).status).toBe(200)
    expect(m.update.mock.calls[0][1]).toEqual({ profilePicture: '' })
  })

  it.each([
    ['an svg', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['a web address', 'https://example.com/a.png'],
    ['text', 'hello'],
    ['an oversized image', `data:image/png;base64,${'A'.repeat(200_001)}`],
  ])('rejects %s as a photo', async (_l, profilePicture) => {
    expect((await put(TARGET, { profilePicture })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('rejects a name that is too short', async () => {
    expect((await put(TARGET, { name: 'x' })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('an invalid id is a 400', async () => {
    expect((await put('nope', { name: 'Sara Khan' })).status).toBe(400)
  })

  it('an unknown account is a 404', async () => {
    m.update.mockImplementation(() => ({ select: async () => null }))
    expect((await put(TARGET, { name: 'Sara Khan' })).status).toBe(404)
  })

  it('only admins may edit; others get 403 and nothing is written', async () => {
    for (const role of ['team_leader', 'developer']) {
      as(id('b'), role, 'x@example.com')
      expect((await put(TARGET, { name: 'Sara Khan' })).status).toBe(403)
    }
    expect(m.update).not.toHaveBeenCalled()
  })

  it('an admin cannot demote or suspend themselves, but may edit their own name and photo', async () => {
    expect((await put(ADMIN, { role: 'developer' })).status).toBe(400)
    expect((await put(ADMIN, { status: 'suspended' })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
    expect((await put(ADMIN, { name: 'Boss Man', profilePicture: PHOTO })).status).toBe(200)
  })

  it('the public demo account cannot edit users', async () => {
    const original = process.env.DEMO_ACCOUNT_EMAIL
    as(ADMIN, 'admin', original ?? 'testing@gmail.com')
    expect((await put(TARGET, { name: 'Sara Khan' })).status).toBe(403)
    expect(m.update).not.toHaveBeenCalled()
  })
})
