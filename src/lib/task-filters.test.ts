import { describe, expect, it } from 'vitest'
import { applyQuickFilter, cleanFilters, filtersToQueryString, hasActiveFilters, quickFilterOf } from './task-filters'

const ME = 'a'.repeat(24)
const OTHER = 'b'.repeat(24)

describe('cleanFilters / query string', () => {
  it('trims the search text and drops empty values', () => {
    expect(cleanFilters({ q: '  login  ', status: undefined, assigneeId: '' })).toEqual({ q: 'login' })
    expect(cleanFilters({ q: '   ' })).toEqual({})
  })

  it('builds a query string with only what is set', () => {
    expect(filtersToQueryString({})).toBe('')
    expect(filtersToQueryString({ q: 'login', status: 'review', assigneeId: ME })).toBe(`q=login&status=review&assigneeId=${ME}`)
  })

  it('encodes the search text rather than passing it through', () => {
    expect(filtersToQueryString({ q: 'a&b=c' })).toBe('q=a%26b%3Dc')
  })

  it('knows when nothing is filtered', () => {
    expect(hasActiveFilters({})).toBe(false)
    expect(hasActiveFilters({ q: '  ' })).toBe(false)
    expect(hasActiveFilters({ status: 'todo' })).toBe(true)
  })
})

describe('quick filters', () => {
  it('a status shortcut sets only the status and keeps the rest', () => {
    expect(applyQuickFilter({ q: 'login' }, 'review', ME)).toEqual({ q: 'login', status: 'review' })
    expect(applyQuickFilter({ assigneeId: OTHER }, 'todo', ME)).toEqual({ assigneeId: OTHER, status: 'todo' })
  })

  it('My Tasks filters to the signed-in user, keeping the status choice cleared', () => {
    expect(applyQuickFilter({ status: 'review' }, 'mine', ME)).toEqual({ assigneeId: ME })
  })

  it('All clears the status and a "mine" filter, but not another developer or the search', () => {
    expect(applyQuickFilter({ q: 'x', status: 'todo', assigneeId: ME }, 'all', ME)).toEqual({ q: 'x', assigneeId: undefined })
    expect(applyQuickFilter({ status: 'todo', assigneeId: OTHER }, 'all', ME)).toEqual({ assigneeId: OTHER })
  })

  it('works out which shortcut is lit', () => {
    expect(quickFilterOf({}, ME)).toBe('all')
    expect(quickFilterOf({ status: 'complete' }, ME)).toBe('complete')
    expect(quickFilterOf({ assigneeId: ME }, ME)).toBe('mine')
    expect(quickFilterOf({ assigneeId: OTHER }, ME)).toBe('all')
  })

  it.each(['todo', 'in-progress', 'review', 'complete'] as const)('the %s shortcut sets exactly that status', (status) => {
    expect(applyQuickFilter({}, status, ME)).toEqual({ status })
    expect(quickFilterOf({ status }, ME)).toBe(status)
  })
})

describe('priority filter', () => {
  it('is part of the filters and the query string', () => {
    expect(hasActiveFilters({ priority: 'high' })).toBe(true)
    expect(filtersToQueryString({ priority: 'urgent', q: 'x' })).toBe('q=x&priority=urgent')
    expect(cleanFilters({ priority: undefined })).toEqual({})
  })

  it('survives choosing a status shortcut', () => {
    expect(applyQuickFilter({ priority: 'high' }, 'review', 'a'.repeat(24))).toEqual({ priority: 'high', status: 'review' })
  })
})

describe('due filter', () => {
  it('sends the viewer’s own date along with it', () => {
    expect(filtersToQueryString({ due: 'overdue' }, '2026-10-10')).toBe('due=overdue&today=2026-10-10')
  })

  it('sends no date when there is no due filter', () => {
    expect(filtersToQueryString({ status: 'todo' }, '2026-10-10')).toBe('status=todo')
  })

  it('counts as an active filter and combines with the others', () => {
    expect(hasActiveFilters({ due: 'today' })).toBe(true)
    expect(filtersToQueryString({ q: 'a', priority: 'high', due: 'none' }, '2026-10-10')).toBe('q=a&priority=high&due=none&today=2026-10-10')
  })
})
