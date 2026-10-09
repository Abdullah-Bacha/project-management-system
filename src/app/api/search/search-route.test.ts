import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const m = vi.hoisted(() => ({
  authenticate: vi.fn(),
  search: vi.fn(),
  connect: vi.fn(),
}))

vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/services/search', () => ({ searchWorkspace: m.search }))
vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: m.connect }))

import { GET } from './route'

const call = (q?: string) =>
  GET(new NextRequest(`http://localhost/api/search${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}`))

const signedIn = (email = 'user@corp.io', role = 'developer') =>
  m.authenticate.mockResolvedValue({ user: { userId: 'u1', email, role }, error: null })

beforeEach(() => {
  vi.resetAllMocks()
  m.search.mockResolvedValue({ projects: [], tasks: [], people: [] })
})

describe('GET /api/search', () => {
  it('requires authentication', async () => {
    m.authenticate.mockResolvedValue({ user: null, error: 'Unauthorized' })
    expect((await call('web')).status).toBe(401)
    expect(m.search).not.toHaveBeenCalled()
  })

  it('does no work for an empty or one-character term', async () => {
    signedIn()
    for (const q of [undefined, '', ' ', 'a']) {
      const res = await call(q)
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ projects: [], tasks: [], people: [] })
    }
    expect(m.search).not.toHaveBeenCalled()
  })

  it('searches with the trimmed term and the caller’s id and role', async () => {
    signedIn('lead@corp.io', 'team_leader')
    await call('  redesign ')
    expect(m.search).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', role: 'team_leader' }), 'redesign')
  })

  it('caps an absurdly long term', async () => {
    signedIn()
    await call('x'.repeat(500))
    expect(m.search.mock.calls[0][1]).toHaveLength(100)
  })

  it('masks other people’s emails for the shared demo account', async () => {
    signedIn('testing@gmail.com', 'admin')
    m.search.mockResolvedValue({
      projects: [],
      tasks: [],
      people: [{ _id: '1', name: 'Real Person', role: 'developer', email: 'real.person@example.com' }],
    })
    const body = await (await call('real')).json()
    expect(body.people[0].email).toBe('r•••@example.com')
  })

  it('returns a 500 without leaking details when the search fails', async () => {
    signedIn()
    m.search.mockRejectedValue(new Error('db exploded: secret detail'))
    const res = await call('web')
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('secret detail')
  })
})
