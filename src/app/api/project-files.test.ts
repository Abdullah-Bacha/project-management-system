import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * A project's shared files: every member can see and download them, only the
 * owner or team leader can add or remove them, and nothing crosses projects.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    projFindById: vi.fn(),
    teamExists: vi.fn(),
    fileFind: vi.fn(),
    fileFindOne: vi.fn(),
    fileCount: vi.fn(),
    fileCreate: vi.fn(),
    fileDeleteOne: vi.fn(),
    getStorage: vi.fn(),
    put: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
  }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/db/models', () => ({
  Project: { findById: m.projFindById },
  Team: { exists: m.teamExists },
  Task: {},
  ProjectFile: { find: m.fileFind, findOne: m.fileFindOne, countDocuments: m.fileCount, create: m.fileCreate, deleteOne: m.fileDeleteOne },
}))
vi.mock('@/lib/storage', () => ({ getStorage: m.getStorage }))
vi.mock('@/lib/services/notifications', () => ({ actorName: async () => 'Admin' }))

import { GET as listGET, POST as uploadPOST } from './projects/[id]/files/route'
import { GET as downloadGET, DELETE as fileDELETE } from './projects/[id]/files/[fileId]/route'

const id = (c: string) => c.repeat(24)
const OWNER = id('a')
const LEADER = id('b')
const DEV = id('c')
const OUTSIDER = id('d')
const PROJECT = id('1')
const OTHER_PROJECT = id('2')
const FILE = id('3')

const project = { _id: PROJECT, owner: OWNER, team: id('7'), members: [OWNER, LEADER, DEV] }

const as = (userId: string, role: string) =>
  m.authenticate.mockResolvedValue({ user: { userId, role, status: 'active', email: `${role}@example.com` }, error: null })

const chain = (value: unknown) => {
  const q: any = {}
  for (const step of ['sort', 'populate', 'select']) q[step] = () => q
  q.lean = () => Promise.resolve(value)
  q.then = (ok: any, bad: any) => Promise.resolve(value).then(ok, bad)
  return q
}

const PDF = Buffer.from('%PDF-1.4\n%fake\n')
const upload = (name: string, bytes: Buffer, type = 'application/pdf', pid = PROJECT) => {
  const form = new FormData()
  form.append('files', new File([new Uint8Array(bytes)], name, { type }))
  return uploadPOST(new NextRequest(`http://localhost/api/projects/${pid}/files`, { method: 'POST', body: form }), { params: Promise.resolve({ id: pid }) })
}
const list = (pid = PROJECT) => listGET(new NextRequest(`http://localhost/api/projects/${pid}/files`), { params: Promise.resolve({ id: pid }) })
const ctx = (pid: string, fid: string) => ({ params: Promise.resolve({ id: pid, fileId: fid }) })
const download = (pid = PROJECT, fid = FILE) => downloadGET(new NextRequest(`http://localhost/api/projects/${pid}/files/${fid}`), ctx(pid, fid))
const remove = (pid = PROJECT, fid = FILE) => fileDELETE(new NextRequest(`http://localhost/api/projects/${pid}/files/${fid}`, { method: 'DELETE' }), ctx(pid, fid))

const stored = { _id: FILE, projectId: PROJECT, originalName: 'brief.pdf', storageKey: `${PROJECT}/k`, mimeType: 'application/pdf', size: 10, uploadedBy: { _id: OWNER, name: 'Admin' }, createdAt: new Date('2026-10-01') }

beforeEach(() => {
  vi.resetAllMocks()
  as(OWNER, 'admin')
  m.projFindById.mockImplementation(() => chain({ ...project, populate: () => chain(project) }))
  m.teamExists.mockImplementation(async (f: any) => (f.teamLeader === LEADER ? { _id: 'x' } : null))
  m.getStorage.mockReturnValue({ name: 'test', put: m.put, get: m.get, delete: m.del })
  m.put.mockResolvedValue(undefined)
  m.del.mockResolvedValue(undefined)
  m.fileFind.mockImplementation(() => chain([stored]))
  m.fileFindOne.mockImplementation(async (f: any) => (f._id === FILE && f.projectId === PROJECT ? { ...stored, uploadedBy: OWNER } : null))
  m.fileCount.mockResolvedValue(0)
  m.fileCreate.mockImplementation(async (d: any) => ({ _id: FILE, createdAt: new Date(), ...d }))
  m.fileDeleteOne.mockResolvedValue({})
  m.get.mockResolvedValue(PDF)
})

describe('who can see and download', () => {
  it.each([
    ['the owner', OWNER, 'admin'],
    ['the team leader', LEADER, 'team_leader'],
    ['a developer on the team', DEV, 'developer'],
  ])('%s can list and download', async (_n, userId, role) => {
    as(userId, role)
    const res = await list()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.files[0]).toMatchObject({ _id: FILE, name: 'brief.pdf', kind: 'pdf' })
    expect(JSON.stringify(body)).not.toContain('storageKey')
    expect(JSON.stringify(body)).not.toContain(`${PROJECT}/`)
    const dl = await download()
    expect(dl.status).toBe(200)
    expect(dl.headers.get('content-disposition')).toContain('attachment')
    expect(dl.headers.get('x-content-type-options')).toBe('nosniff')
  })

  it('someone who is not on the project gets 404 and nothing is read', async () => {
    as(OUTSIDER, 'developer')
    expect((await list()).status).toBe(404)
    expect((await download()).status).toBe(404)
    expect(m.fileFind).not.toHaveBeenCalled()
    expect(m.get).not.toHaveBeenCalled()
  })

  it('signed-out callers get 401', async () => {
    m.authenticate.mockResolvedValue({ user: null, error: 'Unauthorized' })
    expect((await list()).status).toBe(401)
    expect((await download()).status).toBe(401)
  })

  it('a file id from another project is not found, whatever the caller types', async () => {
    expect((await download(PROJECT, id('9'))).status).toBe(404)
    expect(m.fileFindOne.mock.calls[0][0]).toEqual({ _id: id('9'), projectId: PROJECT })
  })

  it.each(['abc', '{"$ne":null}'])('rejects the file id %s with 400', async (bad) => {
    expect((await download(PROJECT, bad)).status).toBe(400)
  })
})

describe('who can add and remove', () => {
  it('the owner and the team leader can upload a valid file', async () => {
    for (const [uid, role] of [[OWNER, 'admin'], [LEADER, 'team_leader']] as const) {
      as(uid, role)
      const res = await upload('brief.pdf', PDF)
      expect(res.status).toBe(201)
      expect((await res.json()).files[0]).toMatchObject({ name: 'brief.pdf', kind: 'pdf' })
    }
    expect(m.put.mock.calls[0][0]).toMatch(new RegExp(`^${PROJECT}/[a-f0-9-]{36}$`))
    expect(m.fileCreate.mock.calls[0][0]).toMatchObject({ projectId: PROJECT, originalName: 'brief.pdf' })
  })

  it('a developer on the team can see and download, but cannot add or remove (403)', async () => {
    as(DEV, 'developer')
    expect((await upload('brief.pdf', PDF)).status).toBe(403)
    expect((await remove()).status).toBe(403)
    expect(m.put).not.toHaveBeenCalled()
    expect(m.fileCreate).not.toHaveBeenCalled()
    expect(m.del).not.toHaveBeenCalled()
  })

  it('an outsider cannot upload or remove (404)', async () => {
    as(OUTSIDER, 'team_leader')
    expect((await upload('brief.pdf', PDF)).status).toBe(404)
    expect((await remove()).status).toBe(404)
    expect(m.put).not.toHaveBeenCalled()
  })

  it.each([
    ['a disallowed type', 'run.exe', Buffer.from('MZ'), 'application/octet-stream'],
    ['a double extension', 'report.exe.pdf', PDF, 'application/pdf'],
    ['an html file', 'page.html', Buffer.from('<html>'), 'text/html'],
    ['a pdf that is not a pdf', 'fake.pdf', Buffer.from('MZ not a pdf'), 'application/pdf'],
    ['an empty file', 'empty.pdf', Buffer.alloc(0), 'application/pdf'],
  ])('refuses %s', async (_l, name, bytes, type) => {
    const res = await upload(name, bytes, type)
    expect(res.status).toBe(400)
    expect(m.put).not.toHaveBeenCalled()
    expect(m.fileCreate).not.toHaveBeenCalled()
  })

  it('stops at the per-project limit', async () => {
    m.fileCount.mockResolvedValue(20)
    expect((await upload('brief.pdf', PDF)).status).toBe(400)
    expect(m.put).not.toHaveBeenCalled()
  })

  it('without file storage, uploads are a clear 503 and listing still works', async () => {
    m.getStorage.mockReturnValue(null)
    expect((await upload('brief.pdf', PDF)).status).toBe(503)
    const body = await (await list()).json()
    expect(body.uploadsEnabled).toBe(false)
  })

  it('if saving the record fails the stored file is removed again', async () => {
    m.fileCreate.mockRejectedValue(new Error('db down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await upload('brief.pdf', PDF)).status).toBe(400)
    expect(m.del).toHaveBeenCalledTimes(1)
  })

  it('the owner can remove a file: the stored file first, then the record', async () => {
    const res = await remove()
    expect(res.status).toBe(200)
    expect(m.del).toHaveBeenCalledWith(stored.storageKey)
    expect(m.fileDeleteOne).toHaveBeenCalledWith({ _id: FILE })
  })

  it('if the stored file cannot be removed the record is kept', async () => {
    m.del.mockRejectedValue(new Error('disk'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await remove()).status).toBe(500)
    expect(m.fileDeleteOne).not.toHaveBeenCalled()
  })

  it('cannot remove a file of another project through this one', async () => {
    expect((await remove(PROJECT, id('9'))).status).toBe(404)
    expect(m.del).not.toHaveBeenCalled()
  })
})
