import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ projectFind: vi.fn(), taskFind: vi.fn() }))

const chain = (rows: unknown[]) => {
  const q: any = {}
  for (const step of ['select', 'limit', 'sort', 'populate']) q[step] = () => q
  q.lean = () => Promise.resolve(rows)
  return q
}

vi.mock('@/lib/db/models', () => ({
  Project: { find: m.projectFind },
  Task: { find: m.taskFind },
  Comment: {},
  Notification: {},
  User: {},
}))

import { listMyTasks } from './tasks'

const id = (c: string) => c.repeat(24)
const ME = id('a')
const DAY = 24 * 3600 * 1000
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY)

const task = (n: string, extra: Record<string, unknown> = {}) => ({
  _id: id(n),
  title: `Task ${n}`,
  status: 'todo',
  priority: 'medium',
  projectId: id('1'),
  ...extra,
})

beforeEach(() => {
  vi.resetAllMocks()
  m.projectFind.mockReturnValue(chain([{ _id: id('1'), title: 'Website' }]))
})

describe('listMyTasks', () => {
  it('only asks for the caller’s own tasks, in projects they belong to', async () => {
    m.taskFind.mockReturnValue(chain([]))
    await listMyTasks(ME, 10)

    expect(m.projectFind).toHaveBeenCalledWith({ $or: [{ owner: ME }, { members: ME }] })
    const filter = m.taskFind.mock.calls[0][0]
    expect(filter.assignedTo).toBe(ME)
    expect(filter.projectId.$in).toEqual([id('1')])
  })

  it('orders by soonest due date, undated last, then by priority', async () => {
    m.taskFind.mockReturnValue(
      chain([
        task('3'),
        task('4', { dueDate: iso(5), priority: 'low' }),
        task('5', { dueDate: iso(5), priority: 'urgent' }),
        task('6', { dueDate: iso(-2) }),
      ])
    )
    const out = await listMyTasks(ME, 10)
    expect(out.tasks.map((t) => t.title)).toEqual(['Task 6', 'Task 5', 'Task 4', 'Task 3'])
  })

  it('counts everything open and overdue, but returns only `limit` rows', async () => {
    m.taskFind.mockReturnValue(
      chain([task('3', { dueDate: iso(-1) }), task('4', { dueDate: iso(-3) }), task('5', { dueDate: iso(2) }), task('6')])
    )
    const out = await listMyTasks(ME, 2)
    expect(out.tasks).toHaveLength(2)
    expect(out.total).toBe(4)
    expect(out.overdue).toBe(2)
  })

  it('attaches the project title and serialises ids and dates', async () => {
    m.taskFind.mockReturnValue(chain([task('3', { dueDate: iso(1) })]))
    const [t] = (await listMyTasks(ME, 10)).tasks
    expect(t.project).toEqual({ _id: id('1'), title: 'Website' })
    expect(typeof t._id).toBe('string')
    expect(typeof t.dueDate).toBe('string')
  })

  it('returns an empty page for a user with no tasks', async () => {
    m.taskFind.mockReturnValue(chain([]))
    expect(await listMyTasks(ME, 10)).toEqual({
      tasks: [],
      total: 0,
      overdue: 0,
      counts: { todo: 0, 'in-progress': 0, review: 0, complete: 0 },
    })
  })

  it('can include finished tasks: they come last and do not count as open', async () => {
    m.taskFind.mockReturnValue(
      chain([task('3', { status: 'complete', dueDate: iso(-5) }), task('4', { dueDate: iso(3) })])
    )
    const out = await listMyTasks(ME, 10, true)
    expect(out.tasks.map((t) => t.status)).toEqual(['todo', 'complete'])
    expect(out.total).toBe(1)
    expect(out.overdue).toBe(0)
    expect(out.counts.complete).toBe(1)
  })

  it('leaves finished tasks out of the rows by default, but still counts them', async () => {
    m.taskFind.mockReturnValue(chain([task('3', { status: 'complete' }), task('4', { status: 'review' })]))
    const out = await listMyTasks(ME, 10)
    expect(out.tasks.map((t) => t.status)).toEqual(['review'])
    expect(out.counts).toEqual({ todo: 0, 'in-progress': 0, review: 1, complete: 1 })
  })
})
