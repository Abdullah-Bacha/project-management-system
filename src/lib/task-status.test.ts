import { describe, expect, it } from 'vitest'
import { allowedMoves, checkTransition, statusTimestamps } from './task-status'
import { formatDuration } from './format'
import type { TaskStatus } from '@/types'

const NOW = new Date('2026-10-08T10:30:00Z')

describe('developer transitions', () => {
  it('may start, submit for review and step back to To Do', () => {
    expect(checkTransition('developer', 'todo', 'in-progress')).toBe('ok')
    expect(checkTransition('developer', 'in-progress', 'review')).toBe('ok')
    expect(checkTransition('developer', 'in-progress', 'todo')).toBe('ok')
  })

  it('cannot skip steps, complete, or touch a task in review or complete', () => {
    expect(checkTransition('developer', 'todo', 'complete')).toBe('invalid')
    expect(checkTransition('developer', 'todo', 'review')).toBe('invalid')
    expect(checkTransition('developer', 'review', 'complete')).toBe('forbidden')
    expect(checkTransition('developer', 'review', 'todo')).toBe('invalid')
    expect(checkTransition('developer', 'review', 'in-progress')).toBe('forbidden')
    expect(checkTransition('developer', 'complete', 'in-progress')).toBe('forbidden')
    expect(checkTransition('developer', 'complete', 'todo')).toBe('invalid')
  })
})

describe('leader transitions', () => {
  it('reviews: complete, send back, reopen', () => {
    expect(checkTransition('leader', 'review', 'complete')).toBe('ok')
    expect(checkTransition('leader', 'review', 'in-progress')).toBe('ok')
    expect(checkTransition('leader', 'complete', 'in-progress')).toBe('ok')
    expect(checkTransition('leader', 'todo', 'in-progress')).toBe('ok')
    expect(checkTransition('leader', 'in-progress', 'todo')).toBe('ok')
    expect(checkTransition('leader', 'in-progress', 'review')).toBe('ok')
  })

  it('still cannot make an illegal jump', () => {
    expect(checkTransition('leader', 'todo', 'complete')).toBe('invalid')
    expect(checkTransition('leader', 'todo', 'review')).toBe('invalid')
    expect(checkTransition('leader', 'review', 'todo')).toBe('invalid')
    expect(checkTransition('leader', 'complete', 'todo')).toBe('invalid')
    expect(checkTransition('leader', 'complete', 'review')).toBe('invalid')
  })

  it('treats an unchanged status as a no-op', () => {
    expect(checkTransition('developer', 'review', 'review')).toBe('same')
  })

  it('never offers a move the check would refuse', () => {
    const all: TaskStatus[] = ['todo', 'in-progress', 'review', 'complete']
    for (const actor of ['leader', 'developer'] as const)
      for (const from of all)
        for (const to of allowedMoves(actor, from)) expect(checkTransition(actor, from, to)).toBe('ok')
  })
})

describe('statusTimestamps', () => {
  it('starting work stamps startedAt', () => {
    expect(statusTimestamps('todo', 'in-progress', {}, NOW).set).toEqual({ startedAt: NOW })
  })

  it('stepping back to To Do clears startedAt, and a restart stamps a new one', () => {
    expect(statusTimestamps('in-progress', 'todo', { startedAt: NOW }, NOW).unset).toEqual(['startedAt'])
    const later = new Date('2026-10-09T08:00:00Z')
    expect(statusTimestamps('todo', 'in-progress', {}, later).set).toEqual({ startedAt: later })
  })

  it('submitting for review stamps nothing', () => {
    const out = statusTimestamps('in-progress', 'review', { startedAt: NOW }, NOW)
    expect(out.set).toEqual({})
    expect(out.unset).toEqual([])
  })

  it('sending a task back from review keeps the current startedAt and stays incomplete', () => {
    const out = statusTimestamps('review', 'in-progress', { startedAt: NOW }, NOW)
    expect(out.set).toEqual({})
    expect(out.unset).toEqual([])
  })

  it('completing stamps completedAt', () => {
    expect(statusTimestamps('review', 'complete', {}, NOW).set).toEqual({ completedAt: NOW })
  })

  it('reopening clears completedAt and starts a new cycle', () => {
    const out = statusTimestamps('complete', 'in-progress', { completedAt: NOW }, NOW)
    expect(out.unset).toEqual(['completedAt'])
    expect(out.set).toEqual({ startedAt: NOW })
  })
})

describe('formatDuration (Elapsed)', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration('2026-10-08T10:30:00Z', '2026-10-08T14:15:00Z')).toBe('3h 45m')
    expect(formatDuration('2026-10-08T10:30:00Z', '2026-10-08T10:42:00Z')).toBe('12m')
    expect(formatDuration('2026-10-08T10:30:00Z', '2026-10-10T14:30:00Z')).toBe('2d 4h')
  })
  it('never invents a duration', () => {
    expect(formatDuration(undefined, '2026-10-08T14:15:00Z')).toBe('')
    expect(formatDuration('2026-10-08T14:15:00Z', undefined)).toBe('')
    expect(formatDuration('2026-10-08T14:15:00Z', '2026-10-08T10:30:00Z')).toBe('')
  })
})
