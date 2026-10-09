import { describe, it, expect, vi, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

/**
 * Who hears about a change. The change stream is replaced by an emitter, so the
 * real routing rules run.
 */
const m = vi.hoisted(() => {
  const { EventEmitter: Emitter } = require('node:events')
  const stream: any = new Emitter()
  stream.close = () => Promise.resolve()
  return { stream: stream as EventEmitter & { close: () => Promise<void> }, projectFind: vi.fn() }
})

vi.mock('@/lib/db/mongodb', () => ({ connectToDatabase: async () => ({ connection: { watch: () => m.stream } }) }))
vi.mock('@/lib/db/models', () => ({ Project: { find: m.projectFind }, Task: { findById: vi.fn() } }))

import { subscribe } from './bus'

const MEMBER = 'u-member'
const ADMIN = 'u-admin'
const OUTSIDER = 'u-outsider'

const heard: Record<string, any[]> = { [MEMBER]: [], [ADMIN]: [], [OUTSIDER]: [] }
const unsubscribe: (() => void)[] = []

async function connectAll() {
  m.projectFind.mockImplementation((filter: any) => {
    const mine = filter?.$or?.some((c: any) => c.owner === MEMBER || c.members === MEMBER)
    const q: any = { select: () => q, lean: () => Promise.resolve(mine ? [{ _id: 'p1' }] : []) }
    return q
  })
  for (const [id, admin] of [[MEMBER, false], [ADMIN, true], [OUTSIDER, false]] as const) {
    heard[id].length = 0
    unsubscribe.push(subscribe(id, (s) => heard[id].push(s), admin))
  }
  await vi.waitFor(() => expect(m.stream.listenerCount('change')).toBeGreaterThan(0))
  await new Promise((r) => setTimeout(r, 10)) // let the memberships load
}

const change = (coll: string, doc: Record<string, unknown>, op = 'update') =>
  m.stream.emit('change', { ns: { coll }, operationType: op, documentKey: { _id: 'x1' }, fullDocument: doc })

afterEach(() => {
  while (unsubscribe.length) unsubscribe.pop()!()
  m.stream.removeAllListeners()
})

describe('project-scoped signals', () => {
  it.each([
    ['tasks', { projectId: 'p1' }],
    ['taskdependencies', { projectId: 'p1' }],
    ['activities', { projectId: 'p1' }],
  ])('%s: members hear it, administrators hear it, outsiders do not', async (coll, doc) => {
    await connectAll()
    change(coll, doc)
    await new Promise((r) => setTimeout(r, 10))
    expect(heard[MEMBER]).toHaveLength(1)
    expect(heard[ADMIN]).toHaveLength(1) // an admin who is not a member still hears it (Reports stay live)
    expect(heard[OUTSIDER]).toHaveLength(0)
    expect(heard[ADMIN][0]).toMatchObject({ collection: coll, id: 'x1', projectId: 'p1' })
  })

  it('a project change reaches members and administrators only', async () => {
    await connectAll()
    change('projects', { owner: 'someone-else', members: [MEMBER] })
    expect(heard[MEMBER]).toHaveLength(1)
    expect(heard[ADMIN]).toHaveLength(1)
    expect(heard[OUTSIDER]).toHaveLength(0)
  })

  it('signals are ids only, never document content', async () => {
    await connectAll()
    change('tasks', { projectId: 'p1', title: 'secret title', description: 'secret body' })
    expect(JSON.stringify(heard[ADMIN])).not.toContain('secret')
  })
})

describe('what stays private', () => {
  it('notifications and direct messages still reach only the person they concern, administrators included', async () => {
    await connectAll()
    change('notifications', { userId: MEMBER })
    change('messages', { sender: MEMBER, recipient: OUTSIDER })
    expect(heard[ADMIN]).toHaveLength(0)
    expect(heard[MEMBER].map((s) => s.collection)).toEqual(['notifications', 'messages'])
    expect(heard[OUTSIDER].map((s) => s.collection)).toEqual(['messages'])
  })

  it('a team change reaches its people and administrators', async () => {
    await connectAll()
    change('teams', { teamLeader: MEMBER, createdBy: 'other', members: [] })
    expect(heard[MEMBER]).toHaveLength(1)
    expect(heard[ADMIN]).toHaveLength(1)
    expect(heard[OUTSIDER]).toHaveLength(0)
  })
})
