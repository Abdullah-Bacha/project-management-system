import { describe, expect, it } from 'vitest'
import { dateOnly, deadlineState, formatDueDate, isValidDateOnly, localToday, parseDueDate } from './due-date'

describe('validating a due date', () => {
  it('accepts a real calendar day', () => {
    expect(isValidDateOnly('2026-10-10')).toBe(true)
    expect(isValidDateOnly('2028-02-29')).toBe(true)
  })

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '10/10/2026', 'tomorrow', '2026-1-1', '', '$ne', '2026-10-10; DROP', '99999-01-01'])(
    'rejects %j',
    (value) => {
      expect(isValidDateOnly(value)).toBe(false)
      expect(parseDueDate(value)).toBeNull()
    }
  )

  it('stores the chosen day at 00:00 UTC', () => {
    expect(parseDueDate('2026-10-10')?.toISOString()).toBe('2026-10-10T00:00:00.000Z')
  })

  it('reduces a full timestamp to its UTC day', () => {
    expect(parseDueDate('2026-10-10T23:30:00.000Z')?.toISOString()).toBe('2026-10-10T00:00:00.000Z')
    expect(parseDueDate('2026-10-10T00:00:00Z')?.toISOString()).toBe('2026-10-10T00:00:00.000Z')
  })

  it('allows a date in the past (that is how an overdue task exists)', () => {
    expect(parseDueDate('2020-01-01')).not.toBeNull()
  })
})

describe('the day is never shifted by timezone', () => {
  it('reads and formats a stored date by its UTC day', () => {
    const stored = new Date('2026-10-10T00:00:00.000Z')
    expect(dateOnly(stored)).toBe('2026-10-10')
    expect(dateOnly('2026-10-10T00:00:00.000Z')).toBe('2026-10-10')
    expect(formatDueDate(stored)).toBe('Oct 10, 2026')
  })

  it('handles no value', () => {
    expect(dateOnly(undefined)).toBe('')
    expect(dateOnly(null)).toBe('')
    expect(formatDueDate(undefined)).toBe('')
  })

  it('uses the viewer’s local calendar date for today', () => {
    expect(localToday(new Date(2026, 9, 10, 23, 59))).toBe('2026-10-10')
    expect(localToday(new Date(2026, 9, 10, 0, 1))).toBe('2026-10-10')
    expect(localToday(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('deadline state', () => {
  const today = '2026-10-10'
  const due = (day: string) => new Date(`${day}T00:00:00Z`)

  it('no due date', () => {
    expect(deadlineState(undefined, 'todo', today)).toBe('NO_DUE_DATE')
    expect(deadlineState(null, 'in-progress', today)).toBe('NO_DUE_DATE')
  })

  it('upcoming, due today and overdue by calendar day, not by clock time', () => {
    expect(deadlineState(due('2026-10-11'), 'todo', today)).toBe('UPCOMING')
    expect(deadlineState(due('2026-10-10'), 'todo', today)).toBe('DUE_TODAY')
    expect(deadlineState(due('2026-10-09'), 'todo', today)).toBe('OVERDUE')
  })

  it('the task is due today for the whole day, and only overdue from tomorrow', () => {
    expect(deadlineState(due('2026-10-10'), 'in-progress', '2026-10-10')).toBe('DUE_TODAY')
    expect(deadlineState(due('2026-10-10'), 'in-progress', '2026-10-11')).toBe('OVERDUE')
  })

  it('a finished task is never active overdue work, whatever its date', () => {
    expect(deadlineState(due('2026-10-05'), 'complete', today)).toBe('COMPLETED')
    expect(deadlineState(due('2026-10-10'), 'complete', today)).toBe('COMPLETED')
  })

  it('a task in review still counts: it is not finished', () => {
    expect(deadlineState(due('2026-10-05'), 'review', today)).toBe('OVERDUE')
  })

  it('reopening a finished task makes the same date count again', () => {
    expect(deadlineState(due('2026-10-05'), 'complete', today)).toBe('COMPLETED')
    expect(deadlineState(due('2026-10-05'), 'in-progress', today)).toBe('OVERDUE')
  })
})
