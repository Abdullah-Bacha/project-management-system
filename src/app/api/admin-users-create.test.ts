import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** Creating an account with a photo and a contact number: what is accepted and what is stored. */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return { authenticate: vi.fn(), findOne: vi.fn(), create: vi.fn() }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({ User: { findOne: m.findOne, create: m.create, find: vi.fn(), countDocuments: vi.fn() } }))
vi.mock('@/lib/auth/password', () => ({ hashPassword: async (p: string) => `hashed:${p}` }))

import { POST } from './admin/users/route'

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/'
const body = (over: Record<string, unknown> = {}) => ({ name: 'Sara Khan', email: 'Sara@Example.com', password: 'secret1', role: 'developer', ...over })
const post = (b: unknown) =>
  POST(new NextRequest('http://localhost/api/admin/users', { method: 'POST', body: JSON.stringify(b), headers: { 'content-type': 'application/json' } }))

beforeEach(() => {
  vi.resetAllMocks()
  m.authenticate.mockResolvedValue({ user: { userId: 'a'.repeat(24), role: 'admin', status: 'active', email: 'boss@example.com' }, error: null })
  m.findOne.mockResolvedValue(null)
  m.create.mockImplementation(async (doc: any) => ({ _id: 'u1', createdAt: new Date(), ...doc }))
})

describe('create user with a photo and a contact number', () => {
  it('stores both and returns them', async () => {
    const res = await post(body({ phone: '+92 300 1234567', profilePicture: PHOTO }))
    expect(res.status).toBe(201)
    expect(m.create.mock.calls[0][0]).toMatchObject({ phone: '+92 300 1234567', profilePicture: PHOTO, email: 'sara@example.com', role: 'developer' })
    const { user } = await res.json()
    expect(user).toMatchObject({ phone: '+92 300 1234567', profilePicture: PHOTO })
    expect(JSON.stringify(user)).not.toContain('hashed') // never the password
  })

  it('both are optional', async () => {
    expect((await post(body())).status).toBe(201)
    expect(m.create.mock.calls[0][0]).toMatchObject({ phone: '', profilePicture: '' })
  })

  it.each([
    ['a non-image data URL', 'data:text/html;base64,PHNjcmlwdD4='],
    ['an svg (can carry script)', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['a web address', 'https://example.com/me.png'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['plain text', 'hello'],
    ['an oversized image', `data:image/jpeg;base64,${'A'.repeat(200_001)}`],
  ])('rejects %s', async (_l, profilePicture) => {
    const res = await post(body({ profilePicture }))
    expect(res.status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it('a non-admin cannot create accounts, photo or not', async () => {
    m.authenticate.mockResolvedValue({ user: { userId: 'b'.repeat(24), role: 'team_leader', status: 'active', email: 'l@example.com' }, error: null })
    expect((await post(body({ profilePicture: PHOTO }))).status).toBe(403)
    expect(m.create).not.toHaveBeenCalled()
  })
})
