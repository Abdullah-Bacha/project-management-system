import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { allOf, dueDateInput, dueFilter, taskSearchFilter, taskSearchShape, textFilter } from './task-search'

const ID = 'a'.repeat(24)
const matches = (filter: Record<string, any>, doc: { title: string; description?: string }) =>
  (filter.$or as { title?: RegExp; description?: RegExp }[]).some((cond) => {
    const [field, rx] = Object.entries(cond)[0] as ['title' | 'description', RegExp]
    return rx.test(doc[field] ?? '')
  })

describe('text search', () => {
  it('finds a title, whatever the case', () => {
    const f = textFilter('login')
    expect(matches(f, { title: 'Login Page' })).toBe(true)
    expect(matches(f, { title: 'Build LOGIN API' })).toBe(true)
    expect(matches(f, { title: 'Login validation' })).toBe(true)
    expect(matches(f, { title: 'Dashboard' })).toBe(false)
  })

  it('also searches the description', () => {
    expect(matches(textFilter('oauth'), { title: 'Auth', description: 'Use OAuth for sign in' })).toBe(true)
  })

  it('ignores surrounding whitespace and an empty search', () => {
    expect(matches(textFilter('   login   '), { title: 'Login Page' })).toBe(true)
    expect(textFilter('   ')).toEqual({})
    expect(textFilter(undefined)).toEqual({})
  })

  it('treats the text literally, never as a pattern or an operator', () => {
    expect(matches(textFilter('a.c'), { title: 'abc' })).toBe(false)
    expect(matches(textFilter('a.c'), { title: 'a.c' })).toBe(true)
    expect(matches(textFilter('.*'), { title: 'anything' })).toBe(false)
    expect(matches(textFilter('(x+)+$'), { title: 'xxxx' })).toBe(false)
    expect(Object.keys(textFilter('{"$ne":1}'))).toEqual(['$or'])
  })
})

describe('filters combine with AND', () => {
  it('search + assignee + creator in one query', () => {
    const f = taskSearchFilter({ q: 'login', assigneeId: ID, createdBy: 'b'.repeat(24) })
    expect(f.assignedTo).toBe(ID)
    expect(f.createdBy).toBe('b'.repeat(24))
    expect(f.$or).toHaveLength(2)
  })

  it('no filters means no extra conditions', () => {
    expect(taskSearchFilter({})).toEqual({})
    expect(allOf({}, {}, {})).toEqual({})
  })

  it('allOf keeps a single part as it is and ANDs several', () => {
    expect(allOf({ assignedTo: ID }, {})).toEqual({ assignedTo: ID })
    expect(allOf({ assignedTo: ID }, { assignedTo: 'b'.repeat(24) })).toEqual({
      $and: [{ assignedTo: ID }, { assignedTo: 'b'.repeat(24) }],
    })
  })

  it('a filter cannot replace the access rule: both conditions stay', () => {
    const access = { assignedTo: ID }
    const asked = taskSearchFilter({ assigneeId: 'b'.repeat(24) })
    expect(allOf(access, asked)).toEqual({ $and: [{ assignedTo: ID }, { assignedTo: 'b'.repeat(24) }] })
  })
})

describe('validation of the query parameters', () => {
  const schema = z.object(taskSearchShape)

  it('accepts the normal shapes and trims the text', () => {
    expect(schema.parse({ q: '  login ', assigneeId: ID, createdBy: ID })).toEqual({ q: 'login', assigneeId: ID, createdBy: ID })
    expect(schema.parse({})).toEqual({})
  })

  it('rejects ids that are not ObjectIds, including operator-looking ones', () => {
    for (const bad of ['nope', '$ne', '{"$gt":""}', 'a'.repeat(23)]) {
      expect(schema.safeParse({ assigneeId: bad }).success).toBe(false)
      expect(schema.safeParse({ createdBy: bad }).success).toBe(false)
    }
  })

  it('rejects an overlong search', () => {
    expect(schema.safeParse({ q: 'x'.repeat(100) }).success).toBe(true)
    expect(schema.safeParse({ q: 'x'.repeat(101) }).success).toBe(false)
  })

  it('does not accept objects (operator injection) in place of strings', () => {
    expect(schema.safeParse({ q: { $ne: '' } }).success).toBe(false)
    expect(schema.safeParse({ assigneeId: { $ne: ID } }).success).toBe(false)
  })
})

describe('due-date filter', () => {
  const TODAY = '2026-10-10'
  const START = new Date('2026-10-10T00:00:00Z')
  const NEXT = new Date('2026-10-11T00:00:00Z')

  it('overdue: a due day before today, and still open', () => {
    expect(dueFilter('overdue', TODAY)).toEqual({ dueDate: { $lt: START }, status: { $ne: 'complete' } })
  })

  it('due today: exactly that day, still open', () => {
    expect(dueFilter('today', TODAY)).toEqual({ dueDate: { $gte: START, $lt: NEXT }, status: { $ne: 'complete' } })
  })

  it('upcoming: after today, still open', () => {
    expect(dueFilter('upcoming', TODAY)).toEqual({ dueDate: { $gte: NEXT }, status: { $ne: 'complete' } })
  })

  it('no due date: null or missing, any status', () => {
    expect(dueFilter('none', TODAY)).toEqual({ dueDate: null })
  })

  it('no filter adds nothing', () => {
    expect(dueFilter(undefined, TODAY)).toEqual({})
  })

  it('combines with search, assignee and creator (AND), alongside a status the caller picked', () => {
    const f = taskSearchFilter({ q: 'login', assigneeId: ID, createdBy: 'b'.repeat(24), due: 'overdue', today: TODAY })
    expect(f.assignedTo).toBe(ID)
    expect(f.$or).toHaveLength(2)
    expect(f.dueDate).toEqual({ $lt: START })
    // The open-work condition is a separate part from an exact status filter, so both must hold.
    expect(allOf(f, { status: 'complete' })).toEqual({ $and: [f, { status: 'complete' }] })
  })

  it('falls back to the server date when no valid "today" is given', () => {
    const f = dueFilter('overdue', 'not-a-date') as { dueDate: { $lt: Date } }
    expect(f.dueDate.$lt.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10))
  })
})

describe('due-date query validation', () => {
  const schema = z.object({ ...taskSearchShape })

  it('accepts the four filters and a real "today"', () => {
    for (const due of ['overdue', 'today', 'upcoming', 'none']) expect(schema.safeParse({ due, today: '2026-10-10' }).success).toBe(true)
  })

  it('rejects unknown filters and malformed or impossible dates', () => {
    expect(schema.safeParse({ due: 'soon' }).success).toBe(false)
    expect(schema.safeParse({ due: { $ne: 'x' } }).success).toBe(false)
    for (const today of ['2026-02-30', 'today', '10/10/2026', '$ne']) expect(schema.safeParse({ today }).success).toBe(false)
  })

  it('a due date input becomes a Date at 00:00 UTC, or fails', () => {
    expect(dueDateInput.parse('2026-10-10')).toEqual(new Date('2026-10-10T00:00:00Z'))
    expect(dueDateInput.safeParse('2026-02-30').success).toBe(false)
    expect(dueDateInput.safeParse('whenever').success).toBe(false)
    expect(dueDateInput.safeParse(20261010).success).toBe(false)
  })
})
