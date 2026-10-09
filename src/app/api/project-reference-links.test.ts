import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/** Reference links on a project: saved at creation, edited by the owner or team leader, and checked on the server. */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return { authenticate: vi.fn(), create: vi.fn(), update: vi.fn(), findById: vi.fn(), teamExists: vi.fn() }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Project: { create: m.create, findByIdAndUpdate: m.update, findById: m.findById },
  Team: { findById: vi.fn(), exists: m.teamExists },
  Task: {},
}))
vi.mock('@/lib/services/projects', () => ({
  PROJECT_POPULATE: [],
  composeMembers: (owner: string) => [owner],
  teamRoster: () => [],
  deleteProjectCascade: vi.fn(),
}))
vi.mock('@/lib/services/notifications', () => ({ notifyProjectAssigned: vi.fn() }))

import { POST as createPOST } from './projects/route'
import { PUT as updatePUT } from './projects/[id]/route'

const id = (c: string) => c.repeat(24)
const OWNER = id('a')
const DEV = id('c')
const PROJECT = id('1')

const as = (userId: string, role: string) =>
  m.authenticate.mockResolvedValue({ user: { userId, role, status: 'active', email: `${role}@example.com` }, error: null })
const json = (b: unknown) => ({ body: JSON.stringify(b), headers: { 'content-type': 'application/json' } })
const create = (b: unknown) => createPOST(new NextRequest('http://localhost/api/projects', { method: 'POST', ...json(b) }))
const update = (b: unknown) => updatePUT(new NextRequest(`http://localhost/api/projects/${PROJECT}`, { method: 'PUT', ...json(b) }), { params: Promise.resolve({ id: PROJECT }) })

const doc = (over: Record<string, unknown> = {}) => {
  const d: any = { _id: PROJECT, title: 'Site', populate: async () => d, ...over }
  return d
}
const chain = (value: any) => {
  const q: any = {}
  q.populate = () => q
  q.then = (ok: any, bad: any) => Promise.resolve(value).then(ok, bad)
  return q
}

beforeEach(() => {
  vi.resetAllMocks()
  as(OWNER, 'admin')
  m.create.mockImplementation(async (d: any) => doc(d))
  m.findById.mockImplementation(() => chain({ _id: PROJECT, owner: OWNER, members: [OWNER, DEV], team: id('7') }))
  m.update.mockImplementation(() => chain(doc()))
  m.teamExists.mockResolvedValue(null)
})

describe('creating a project with links', () => {
  it('saves cleaned links, label optional', async () => {
    const res = await create({ title: 'New site', referenceLinks: [{ label: 'Design', url: 'figma.com/file/a' }, { url: 'https://example.com' }] })
    expect(res.status).toBe(201)
    expect(m.create.mock.calls[0][0].referenceLinks).toEqual([{ label: 'Design', url: 'https://figma.com/file/a' }, { url: 'https://example.com/' }])
    expect(m.create.mock.calls[0][0].owner).toBe(OWNER)
  })

  it('is optional', async () => {
    expect((await create({ title: 'New site' })).status).toBe(201)
  })

  it.each([
    ['a javascript: link', [{ url: 'javascript:alert(1)' }]],
    ['a data: link', [{ url: 'data:text/html;base64,PHNjcmlwdD4=' }]],
    ['too many links', Array.from({ length: 11 }, (_, i) => ({ url: `https://example.com/${i}` }))],
    ['an operator as a link', [{ url: { $ne: '' } }]],
  ])('rejects %s and creates nothing', async (_l, referenceLinks) => {
    expect((await create({ title: 'New site', referenceLinks })).status).toBe(400)
    expect(m.create).not.toHaveBeenCalled()
  })

  it('only an admin may create a project, links or not', async () => {
    as(DEV, 'developer')
    expect((await create({ title: 'New site', referenceLinks: [{ url: 'https://example.com' }] })).status).toBe(403)
    expect(m.create).not.toHaveBeenCalled()
  })
})

describe('editing the links', () => {
  it('the owner replaces the list', async () => {
    expect((await update({ referenceLinks: [{ url: 'https://example.com/a' }] })).status).toBe(200)
    expect(m.update.mock.calls[0][1]).toEqual({ $set: { referenceLinks: [{ url: 'https://example.com/a' }] } })
  })

  it('an empty list clears them', async () => {
    expect((await update({ referenceLinks: [] })).status).toBe(200)
    expect(m.update.mock.calls[0][1]).toEqual({ $set: { referenceLinks: [] } })
  })

  it('a developer on the project cannot change them (403)', async () => {
    as(DEV, 'developer')
    expect((await update({ referenceLinks: [{ url: 'https://example.com/a' }] })).status).toBe(403)
    expect(m.update).not.toHaveBeenCalled()
  })

  it('an unsafe link is refused', async () => {
    expect((await update({ referenceLinks: [{ url: 'javascript:alert(1)' }] })).status).toBe(400)
    expect(m.update).not.toHaveBeenCalled()
  })
})
