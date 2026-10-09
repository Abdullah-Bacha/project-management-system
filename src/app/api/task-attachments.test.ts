import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Task attachments at the route level. The real authorization guard and the
 * real attachment service run; the database is a small in-memory store and the
 * file storage is an in-memory map, so what is checked is the behaviour:
 * who may do what, what is refused, and that nothing is left behind.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return {
    authenticate: vi.fn(),
    taskFindById: vi.fn(),
    projectFindById: vi.fn(),
    teamExists: vi.fn(),
    record: vi.fn(),
    // In-memory stand-ins
    rows: [] as any[],
    files: new Map<string, Buffer>(),
    putFails: false,
    deleteFails: false,
    createFails: false,
    storageOn: true,
    puts: [] as string[],
    deletes: [] as string[],
  }
})

const matches = (row: any, filter: Record<string, any>) =>
  Object.entries(filter).every(([k, v]) => (v && typeof v === 'object' && '$in' in v ? v.$in.map(String).includes(String(row[k])) : String(row[k]) === String(v)))

const storage = {
  name: 'memory',
  put: vi.fn(async (key: string, data: Buffer) => {
    if (m.putFails) throw new Error('disk full')
    m.files.set(key, data)
    m.puts.push(key)
  }),
  get: vi.fn(async (key: string) => m.files.get(key) ?? null),
  delete: vi.fn(async (key: string) => {
    if (m.deleteFails) throw new Error('cannot delete')
    m.files.delete(key)
    m.deletes.push(key)
  }),
}

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: vi.fn() }))
vi.mock('@/lib/auth/middleware', () => ({ authenticateRequest: m.authenticate }))
vi.mock('@/lib/storage', () => ({ getStorage: () => (m.storageOn ? storage : null) }))
vi.mock('@/lib/db/models', () => ({
  Task: { findById: m.taskFindById },
  Project: { findById: m.projectFindById },
  Team: { exists: m.teamExists },
  Attachment: {
    find: (filter: any) => {
      const rows = m.rows.filter((r) => matches(r, filter))
      const q: any = { sort: () => q, populate: () => q, select: () => q, lean: () => Promise.resolve(rows) }
      return q
    },
    findOne: async (filter: any) => m.rows.find((r) => matches(r, filter)) ?? null,
    countDocuments: async (filter: any) => m.rows.filter((r) => matches(r, filter)).length,
    create: async (doc: any) => {
      if (m.createFails) throw new Error('db down')
      const row = { _id: String(m.rows.length + 1).padStart(24, 'f'), createdAt: new Date(), ...doc }
      m.rows.push(row)
      // Like a Mongoose document: the values are reachable by name but are not own enumerable properties.
      class DocLike {
        $__ = {}
        get _id() { return row._id }
        get createdAt() { return row.createdAt }
        get originalName() { return row.originalName }
        get mimeType() { return row.mimeType }
        get size() { return row.size }
      }
      return new DocLike()
    },
    deleteOne: async (filter: any) => {
      m.rows = m.rows.filter((r) => !matches(r, filter))
    },
    deleteMany: async (filter: any) => {
      m.rows = m.rows.filter((r) => !matches(r, filter))
    },
  },
}))
vi.mock('@/lib/services/notifications', () => ({ emitNotification: vi.fn(), actorName: vi.fn().mockResolvedValue('Uploader') }))
vi.mock('@/lib/services/activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/activity')>()),
  recordActivity: m.record,
}))

import { GET as listAttachments, POST as upload } from './tasks/[id]/attachments/route'
import { GET as download, DELETE as remove } from './tasks/[id]/attachments/[attachmentId]/route'
import { deleteProjectAttachments, deleteTaskAttachments } from '@/lib/services/attachments'
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_TASK, MAX_FILES_PER_REQUEST } from '@/lib/attachments'

const id = (c: string) => c.repeat(24)
const LEADER = id('b')
const DEV = id('c')
const TEAMMATE = id('d')
const OUTSIDER = id('e')
const TASK = id('1')
const OTHER_TASK = id('7')
const PROJECT = id('2')

const project = { _id: PROJECT, title: 'P', owner: id('a'), team: id('3'), members: [id('a'), LEADER, DEV, TEAMMATE] }
const task = { _id: TASK, title: 'Fix bug', projectId: PROJECT, status: 'in-progress', assignedTo: DEV, createdBy: LEADER }
const otherTask = { ...task, _id: OTHER_TASK, assignedTo: TEAMMATE }

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const DOCX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)])

const as = (userId: string | null, { leader = false } = {}) => {
  m.authenticate.mockResolvedValue(userId ? { user: { userId, role: 'developer' }, error: null } : { user: null, error: 'Unauthorized' })
  m.teamExists.mockResolvedValue(leader ? { _id: id('3') } : null)
}

const chain = (value: unknown) => {
  const q: any = { populate: () => q, then: (ok: any) => ok(value) }
  return q
}

const params = (taskId: string, attachmentId?: string) => ({ params: Promise.resolve({ id: taskId, attachmentId: attachmentId ?? '' }) })
const sendFiles = (taskId: string, files: { name: string; type: string; bytes: Buffer | Uint8Array }[], field = 'files') => {
  const form = new FormData()
  for (const f of files) form.append(field, new File([new Uint8Array(f.bytes)], f.name, { type: f.type }))
  return upload(new NextRequest(`http://localhost/api/tasks/${taskId}/attachments`, { method: 'POST', body: form }), params(taskId))
}
const list = (taskId = TASK) => listAttachments(new NextRequest(`http://localhost/api/tasks/${taskId}/attachments`), params(taskId))
const get = (taskId: string, attachmentId: string) =>
  download(new NextRequest(`http://localhost/api/tasks/${taskId}/attachments/${attachmentId}`), params(taskId, attachmentId))
const del = (taskId: string, attachmentId: string) =>
  remove(new NextRequest(`http://localhost/api/tasks/${taskId}/attachments/${attachmentId}`, { method: 'DELETE' }), params(taskId, attachmentId))

/** An attachment already stored, uploaded by `by`, on `taskId`. */
const seed = (by: string, taskId = TASK, name = 'spec.pdf') => {
  const key = `${taskId}/${'0'.repeat(8)}-0000-0000-0000-${String(m.rows.length).padStart(12, '0')}`
  m.files.set(key, PDF)
  const row = { _id: String(m.rows.length + 1).padStart(24, 'a'), taskId, projectId: PROJECT, uploadedBy: by, originalName: name, storageKey: key, mimeType: 'application/pdf', size: PDF.length, createdAt: new Date() }
  m.rows.push(row)
  return row
}

beforeEach(() => {
  vi.clearAllMocks()
  m.rows = []
  m.files.clear()
  m.puts.length = 0
  m.deletes.length = 0
  m.putFails = m.deleteFails = m.createFails = false
  m.storageOn = true
  m.authenticate.mockReset()
  m.teamExists.mockReset()
  m.taskFindById.mockImplementation((taskId: string) => chain(taskId === OTHER_TASK ? otherTask : task))
  m.projectFindById.mockResolvedValue(project)
})

describe('who can reach a task’s attachments', () => {
  it('signed-out callers get 401 on every route', async () => {
    as(null)
    expect((await list()).status).toBe(401)
    expect((await sendFiles(TASK, [{ name: 'a.pdf', type: 'application/pdf', bytes: PDF }])).status).toBe(401)
    expect((await get(TASK, id('a'))).status).toBe(401)
    expect((await del(TASK, id('a'))).status).toBe(401)
  })

  it('someone outside the project gets 404 and nothing is stored', async () => {
    as(OUTSIDER)
    expect((await list()).status).toBe(404)
    expect((await sendFiles(TASK, [{ name: 'a.pdf', type: 'application/pdf', bytes: PDF }])).status).toBe(404)
    const row = seed(DEV)
    expect((await get(TASK, row._id)).status).toBe(404)
    expect((await del(TASK, row._id)).status).toBe(404)
    expect(m.puts).toEqual([])
    expect(m.rows).toHaveLength(1)
  })

  it('a developer who is not on the task is refused (403), as for the task itself', async () => {
    as(TEAMMATE)
    const row = seed(DEV)
    expect((await list()).status).toBe(403)
    expect((await get(TASK, row._id)).status).toBe(403)
    expect((await sendFiles(TASK, [{ name: 'a.pdf', type: 'application/pdf', bytes: PDF }])).status).toBe(403)
    expect((await del(TASK, row._id)).status).toBe(403)
    expect(m.rows).toHaveLength(1)
    expect(m.deletes).toEqual([])
  })

  it('the assignee and the team leader can list, and the storage key is never exposed', async () => {
    seed(DEV)
    for (const who of [DEV, LEADER]) {
      as(who, { leader: who === LEADER })
      const res = await list()
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.attachments).toHaveLength(1)
      expect(body.attachments[0]).toMatchObject({ name: 'spec.pdf', mimeType: 'application/pdf', kind: 'pdf', size: PDF.length })
      expect(JSON.stringify(body)).not.toContain('storageKey')
      expect(JSON.stringify(body)).not.toContain(TASK + '/')
      expect(body.uploadsEnabled).toBe(true)
    }
  })
})

describe('uploading', () => {
  beforeEach(() => as(DEV))

  it.each([
    ['a PDF', 'spec.pdf', 'application/pdf', PDF, 'application/pdf'],
    ['an image', 'shot.png', 'image/png', PNG, 'image/png'],
    ['a Word document', 'brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', DOCX, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ])('accepts %s', async (_label, name, type, bytes, storedType) => {
    const res = await sendFiles(TASK, [{ name, type, bytes }])
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.attachments[0]).toMatchObject({ name, mimeType: storedType, size: bytes.length, uploadedBy: { name: 'Uploader' } })

    // Stored under this task, the metadata saved once, and one activity entry.
    expect(m.puts).toHaveLength(1)
    expect(m.puts[0].startsWith(`${TASK}/`)).toBe(true)
    expect(m.rows).toHaveLength(1)
    expect(m.rows[0]).toMatchObject({ taskId: TASK, projectId: PROJECT, uploadedBy: DEV, mimeType: storedType })
    expect(m.record).toHaveBeenCalledTimes(1)
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'ATTACHMENT_ADDED', taskId: TASK, metadata: { fileName: name } }))
  })

  it('the team leader can upload too', async () => {
    as(LEADER, { leader: true })
    expect((await sendFiles(TASK, [{ name: 'spec.pdf', type: 'application/pdf', bytes: PDF }])).status).toBe(201)
  })

  it.each([
    ['an executable', 'setup.exe', 'application/x-msdownload', Buffer.from('MZ\u0090\u0000')],
    ['a script', 'run.sh', 'text/x-sh', Buffer.from('#!/bin/sh\n')],
    ['a hidden double extension', 'report.exe.pdf', 'application/pdf', PDF],
    ['a type that does not match the name', 'spec.pdf', 'image/png', PDF],
    ['content that is not what the name says', 'spec.pdf', 'application/pdf', PNG],
    ['an executable renamed to .png', 'photo.png', 'image/png', Buffer.from('MZ\u0090\u0000\u0003')],
    ['an SVG carrying script', 'logo.svg', 'image/svg+xml', Buffer.from('<svg><script>alert(1)</script></svg>')],
    ['an empty file', 'empty.pdf', 'application/pdf', Buffer.alloc(0)],
  ])('refuses %s, storing nothing', async (_label, name, type, bytes) => {
    const res = await sendFiles(TASK, [{ name, type, bytes }])
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(body.rejected).toHaveLength(1)
    expect(m.puts).toEqual([])
    expect(m.rows).toEqual([])
    expect(m.record).not.toHaveBeenCalled()
  })

  it('refuses a file over the size limit', async () => {
    const big = Buffer.concat([PDF, Buffer.alloc(MAX_ATTACHMENT_BYTES)])
    const res = await sendFiles(TASK, [{ name: 'big.pdf', type: 'application/pdf', bytes: big }])
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('too large')
    expect(m.puts).toEqual([])
  })

  it('a request without a file is refused', async () => {
    const res = await upload(
      new NextRequest(`http://localhost/api/tasks/${TASK}/attachments`, { method: 'POST', body: new FormData() }),
      params(TASK)
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No file was provided.')
  })

  it('text in the file field is not a file', async () => {
    const form = new FormData()
    form.append('files', '/etc/passwd')
    const res = await upload(new NextRequest(`http://localhost/api/tasks/${TASK}/attachments`, { method: 'POST', body: form }), params(TASK))
    expect(res.status).toBe(400)
  })

  it('a body that is not multipart is refused', async () => {
    const res = await upload(
      new NextRequest(`http://localhost/api/tasks/${TASK}/attachments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ files: ['a.pdf'] }),
      }),
      params(TASK)
    )
    expect(res.status).toBe(400)
  })

  it('too many files at once are refused', async () => {
    const files = Array.from({ length: MAX_FILES_PER_REQUEST + 1 }, (_, i) => ({ name: `f${i}.pdf`, type: 'application/pdf', bytes: PDF }))
    expect((await sendFiles(TASK, files)).status).toBe(400)
    expect(m.puts).toEqual([])
  })

  it('files are judged one by one: the good one is saved and the bad one reported', async () => {
    const res = await sendFiles(TASK, [
      { name: 'spec.pdf', type: 'application/pdf', bytes: PDF },
      { name: 'setup.exe', type: 'application/x-msdownload', bytes: Buffer.from('MZ') },
      { name: 'shot.png', type: 'image/png', bytes: PNG },
    ])
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.attachments.map((a: any) => a.name).sort()).toEqual(['shot.png', 'spec.pdf'])
    expect(body.rejected).toEqual([{ name: 'setup.exe', error: 'This file type is not supported.' }])
    expect(m.rows).toHaveLength(2)
    expect(m.record).toHaveBeenCalledTimes(2)
  })

  it('a task holds a limited number of files', async () => {
    for (let i = 0; i < MAX_ATTACHMENTS_PER_TASK; i++) seed(DEV, TASK, `f${i}.pdf`)
    const res = await sendFiles(TASK, [{ name: 'one-more.pdf', type: 'application/pdf', bytes: PDF }])
    expect(res.status).toBe(400)
    expect(m.puts).toEqual([])
  })

  it('a storage failure is reported plainly and leaves no record', async () => {
    m.putFails = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await sendFiles(TASK, [{ name: 'spec.pdf', type: 'application/pdf', bytes: PDF }])
    expect(res.status).toBe(400)
    const text = JSON.stringify(await res.json())
    expect(text).toContain('Upload failed. Please try again.')
    expect(text).not.toContain('disk full')
    expect(m.rows).toEqual([])
  })

  it('if the record cannot be saved, the stored file is removed again', async () => {
    m.createFails = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await sendFiles(TASK, [{ name: 'spec.pdf', type: 'application/pdf', bytes: PDF }])
    expect(res.status).toBe(400)
    expect(m.puts).toHaveLength(1)
    expect(m.deletes).toEqual(m.puts)
    expect(m.files.size).toBe(0)
  })

  it('without file storage configured (production today) uploads are refused with 503 and the list says so', async () => {
    m.storageOn = false
    const res = await sendFiles(TASK, [{ name: 'spec.pdf', type: 'application/pdf', bytes: PDF }])
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('File storage is not configured on this server.')
    expect((await (await list()).json()).uploadsEnabled).toBe(false)
  })
})

describe('an attachment belongs to its task', () => {
  it('cannot be reached through another task, even by someone allowed on both', async () => {
    const row = seed(DEV, TASK)
    as(LEADER, { leader: true })
    // The leader may open both tasks, but this attachment is only on TASK.
    expect((await get(TASK, row._id)).status).toBe(200)
    expect((await get(OTHER_TASK, row._id)).status).toBe(404)
    expect((await del(OTHER_TASK, row._id)).status).toBe(404)
    expect(m.rows).toHaveLength(1)
    expect(m.deletes).toEqual([])
  })

  it('a developer cannot reach a teammate’s file by guessing its id on their own task', async () => {
    const teammateFile = seed(TEAMMATE, OTHER_TASK)
    as(DEV)
    expect((await get(TASK, teammateFile._id)).status).toBe(404)
    expect((await del(TASK, teammateFile._id)).status).toBe(404)
    expect(m.rows).toHaveLength(1)
  })

  it.each(['$ne', 'abc', '{"$gt":""}', '12345'])('rejects a malformed attachment id %j with 400', async (bad) => {
    as(LEADER, { leader: true })
    expect((await get(TASK, bad)).status).toBe(400)
    expect((await del(TASK, bad)).status).toBe(400)
  })

  it('an unknown id is a plain 404', async () => {
    as(LEADER, { leader: true })
    expect((await get(TASK, id('9'))).status).toBe(404)
  })
})

describe('downloading', () => {
  it('sends the file as a download that the browser cannot run or sniff', async () => {
    const row = seed(DEV, TASK, 'project spec (v2).pdf')
    as(DEV)
    const res = await get(TASK, row._id)
    expect(res.status).toBe(200)
    expect(Buffer.from(await res.arrayBuffer()).equals(PDF)).toBe(true)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename\*=UTF-8''project%20spec%20%28v2%29\.pdf$/)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('cache-control')).toContain('no-store')
  })

  it('a record whose file has gone is a 404, not an error', async () => {
    const row = seed(DEV)
    m.files.clear()
    as(DEV)
    expect((await get(TASK, row._id)).status).toBe(404)
  })
})

describe('deleting', () => {
  it('the team leader can remove any file: the file, then the record, and one activity entry', async () => {
    const row = seed(DEV)
    as(LEADER, { leader: true })
    expect((await del(TASK, row._id)).status).toBe(200)
    expect(m.deletes).toEqual([row.storageKey])
    expect(m.rows).toEqual([])
    expect(m.record).toHaveBeenCalledWith(expect.objectContaining({ type: 'ATTACHMENT_DELETED', metadata: { fileName: 'spec.pdf' } }))
    expect(m.record).toHaveBeenCalledTimes(1)
  })

  it('the assignee can remove a file they uploaded', async () => {
    const row = seed(DEV)
    as(DEV)
    expect((await del(TASK, row._id)).status).toBe(200)
    expect(m.rows).toEqual([])
  })

  it('the assignee cannot remove a file someone else uploaded (403)', async () => {
    const row = seed(LEADER)
    as(DEV)
    expect((await del(TASK, row._id)).status).toBe(403)
    expect(m.rows).toHaveLength(1)
    expect(m.deletes).toEqual([])
    expect(m.record).not.toHaveBeenCalled()
  })

  it('if the file cannot be removed the record is kept, so it can be retried', async () => {
    const row = seed(DEV)
    m.deleteFails = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    as(DEV)
    const res = await del(TASK, row._id)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain('cannot delete')
    expect(m.rows).toHaveLength(1)
    expect(m.record).not.toHaveBeenCalled()
  })
})

describe('cleaning up with the task or project', () => {
  it('deleting a task removes its files and its records, and nobody else’s', async () => {
    const a = seed(DEV, TASK, 'a.pdf')
    const b = seed(LEADER, TASK, 'b.pdf')
    const keep = seed(TEAMMATE, OTHER_TASK, 'keep.pdf')

    await deleteTaskAttachments(TASK)

    expect(m.deletes.sort()).toEqual([a.storageKey, b.storageKey].sort())
    expect(m.rows.map((r) => r._id)).toEqual([keep._id])
    expect(m.files.has(keep.storageKey)).toBe(true)
  })

  it('deleting a project removes every file of every task in it', async () => {
    seed(DEV, TASK)
    seed(TEAMMATE, OTHER_TASK)
    await deleteProjectAttachments(PROJECT)
    expect(m.rows).toEqual([])
    expect(m.files.size).toBe(0)
  })

  it('a file that cannot be removed keeps its record, so it is not orphaned unseen', async () => {
    const a = seed(DEV, TASK, 'a.pdf')
    m.deleteFails = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await deleteTaskAttachments(TASK)
    expect(m.rows.map((r) => r._id)).toEqual([a._id])
  })

  it('does nothing for a task without attachments', async () => {
    await deleteTaskAttachments(TASK)
    expect(storage.delete).not.toHaveBeenCalled()
  })
})
