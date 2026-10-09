import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  projectFind: vi.fn(),
  taskFind: vi.fn(),
  userFind: vi.fn(),
  teamFind: vi.fn(),
}))

// find().select().sort().limit().lean() chains, resolving to `rows`.
const chain = (rows: unknown[]) => {
  const q: any = {}
  for (const step of ['select', 'sort', 'limit']) q[step] = () => q
  q.lean = () => Promise.resolve(rows)
  return q
}

vi.mock('@/lib/db/models', () => ({
  Project: { find: m.projectFind },
  Task: { find: m.taskFind },
  User: { find: m.userFind },
  Team: { find: m.teamFind },
}))

import { searchWorkspace } from './search'

const id = (c: string) => c.repeat(24)
const ME = id('a')
const COLLEAGUE = id('b')
const STRANGER = id('c')

const projects = [
  { _id: id('1'), title: 'Website Redesign', status: 'active', owner: ME, members: [ME, COLLEAGUE] },
  { _id: id('2'), title: 'Mobile App', status: 'active', owner: id('d'), members: [ME] },
]

beforeEach(() => {
  vi.resetAllMocks()
  m.projectFind.mockReturnValue(chain(projects))
  m.taskFind.mockReturnValue(chain([]))
  m.userFind.mockReturnValue(chain([]))
  m.teamFind.mockReturnValue(chain([]))
})

describe('searchWorkspace', () => {
  it('finds only projects whose title matches, case-insensitively', async () => {
    const out = await searchWorkspace({ userId: ME, role: 'developer' }, 'website')
    expect(out.projects.map((p) => p.title)).toEqual(['Website Redesign'])
  })

  it('looks for projects only among those the user owns or belongs to', async () => {
    await searchWorkspace({ userId: ME, role: 'developer' }, 'web')
    expect(m.projectFind).toHaveBeenCalledWith({ $or: [{ owner: ME }, { members: ME }] })
  })

  it('searches tasks only inside the user’s own projects, with the project title attached', async () => {
    m.taskFind.mockReturnValue(
      chain([{ _id: id('9'), title: 'Fix login', status: 'todo', priority: 'high', projectId: id('1') }])
    )
    const out = await searchWorkspace({ userId: ME, role: 'developer' }, 'login')

    const filter = m.taskFind.mock.calls[0][0]
    expect(filter.projectId.$in).toEqual([id('1'), id('2')])
    expect(out.tasks[0]).toMatchObject({ title: 'Fix login', project: { _id: id('1'), title: 'Website Redesign' } })
  })

  it('treats the term as plain text, not a pattern', async () => {
    const out = await searchWorkspace({ userId: ME, role: 'developer' }, 'a.b')
    expect(out.projects).toEqual([]) // "a.b" must not match "Mobile App" via regex "."
    const filter = m.taskFind.mock.calls[0][0]
    expect(filter.title.source).toBe('a\\.b')
  })

  describe('people', () => {
    it('admin: searches the whole directory by name or email and gets emails back', async () => {
      m.userFind.mockReturnValue(chain([{ _id: id('e'), name: 'Dana', role: 'developer', email: 'dana@x.io' }]))
      const out = await searchWorkspace({ userId: ME, role: 'admin' }, 'dana')

      const filter = m.userFind.mock.calls[0][0]
      expect(filter.$or).toHaveLength(2)
      expect(filter.status).toEqual({ $ne: 'suspended' })
      expect(filter._id).toEqual({ $ne: ME })
      expect(out.people).toEqual([{ _id: id('e'), name: 'Dana', role: 'developer', email: 'dana@x.io' }])
    })

    it('non-admin: limited to colleagues from shared projects, by name only, without emails', async () => {
      m.userFind.mockReturnValue(chain([{ _id: COLLEAGUE, name: 'Casey', role: 'developer' }]))
      const out = await searchWorkspace({ userId: ME, role: 'team_leader' }, 'cas')

      const filter = m.userFind.mock.calls[0][0]
      expect(filter._id.$in).toContain(COLLEAGUE)
      expect(filter._id.$in).not.toContain(ME)
      expect(filter._id.$in).not.toContain(STRANGER)
      expect(filter.email).toBeUndefined()
      expect(filter.$or).toBeUndefined()
      expect(filter.status).toEqual({ $ne: 'suspended' })
      expect(out.people[0]).toEqual({ _id: COLLEAGUE, name: 'Casey', role: 'developer' })
      expect(out.people[0]).not.toHaveProperty('email')
    })

    it('non-admin with no projects finds nobody and never queries the directory', async () => {
      m.projectFind.mockReturnValue(chain([]))
      const out = await searchWorkspace({ userId: ME, role: 'developer' }, 'anyone')
      expect(out.people).toEqual([])
      expect(m.userFind).not.toHaveBeenCalled()
    })
  })
})
