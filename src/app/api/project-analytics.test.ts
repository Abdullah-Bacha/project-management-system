import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * The older per-project analytics route: its existing numbers are protected,
 * and its overdue count now follows the viewer's date when one is sent.
 */
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = 'a'.repeat(40)
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(40)
  return { authorize: vi.fn(), taskFind: vi.fn() }
})

vi.mock('@/lib/auth/authorize', () => ({ authorizeProject: m.authorize }))
vi.mock('@/lib/db/models', () => ({ Task: { find: m.taskFind } }))

import { GET } from './projects/[id]/analytics/route'

const chain = (value: unknown) => {
  const q: any = {}
  for (const step of ['select', 'sort', 'limit']) q[step] = () => q
  q.lean = () => Promise.resolve(value)
  return q
}

const task = (status: string, dueDate?: string, extra: Record<string, unknown> = {}) => ({
  status,
  priority: 'medium',
  estimatedHours: 0,
  ...(dueDate && { dueDate: new Date(`${dueDate}T00:00:00Z`) }),
  ...extra,
})

const call = (query = '') =>
  GET(new NextRequest(`http://localhost/api/projects/p1/analytics${query}`), { params: Promise.resolve({ id: 'p1' }) })

beforeEach(() => {
  vi.resetAllMocks()
  m.authorize.mockResolvedValue({ data: {} })
  m.taskFind.mockImplementation(() =>
    chain([
      task('todo', '2026-10-08'), // due yesterday (for a viewer whose today is 10-09)
      task('in-progress', '2026-10-09'), // due today
      task('review', '2026-10-10'),
      task('complete', '2026-10-01'), // finished: never overdue
      task('todo'), // no due date
    ])
  )
})
afterEach(() => vi.useRealTimers())

describe('existing behaviour', () => {
  it('returns the authorization response verbatim', async () => {
    m.authorize.mockResolvedValue({ response: NextResponse.json({ error: 'Project not found' }, { status: 404 }) })
    expect((await call()).status).toBe(404)
    expect(m.taskFind).not.toHaveBeenCalled()
  })

  it('counts statuses and completion as before', async () => {
    const body = await (await call('?today=2026-10-09')).json()
    expect(body.tasksByStatus).toEqual({ todo: 2, 'in-progress': 1, review: 1, complete: 1 })
    expect(body).toMatchObject({ totalTasks: 5, completedTasks: 1, completionRate: 20 })
  })

  it('without a date it still uses the server UTC date', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T10:00:00Z'))
    expect((await (await call()).json()).overdueTasks).toBe(1) // only the 10-08 task
  })
})

describe('the viewer\'s date', () => {
  it('overdue follows the date sent: due today is not overdue, finished is never overdue', async () => {
    expect((await (await call('?today=2026-10-09')).json()).overdueTasks).toBe(1)
    expect((await (await call('?today=2026-10-10')).json()).overdueTasks).toBe(2) // 10-08 and 10-09 are now past
    expect((await (await call('?today=2026-10-08')).json()).overdueTasks).toBe(0) // due on 10-08 is "today"
  })

  it('a viewer ahead of UTC, just after local midnight, sees the right overdue count', async () => {
    // 01:00 on 10-10 in Karachi is 20:00Z on 10-09: the server clock still says 10-09.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-09T20:00:00Z'))
    expect((await (await call()).json()).overdueTasks).toBe(1) // server UTC: 10-09 is today
    expect((await (await call('?today=2026-10-10')).json()).overdueTasks).toBe(2) // viewer: 10-10 is today
  })

  it.each(['?today=2026-02-30', '?today=10/09/2026', '?today=', '?today=%7B%22%24ne%22%3Anull%7D'])('rejects %s with 400', async (q) => {
    expect((await call(q)).status).toBe(400)
    expect(m.taskFind).not.toHaveBeenCalled()
  })
})
