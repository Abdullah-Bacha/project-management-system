import { describe, expect, it } from 'vitest'
import { greetingFor, timeAgo } from './format'

describe('greetingFor', () => {
  it('follows the time of day', () => {
    expect(greetingFor(6)).toBe('Good morning')
    expect(greetingFor(12)).toBe('Good afternoon')
    expect(greetingFor(18)).toBe('Good evening')
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-01-10T12:00:00Z').getTime()
  it('formats relative times', () => {
    expect(timeAgo('2026-01-10T11:59:50Z', now)).toBe('just now')
    expect(timeAgo('2026-01-10T11:55:00Z', now)).toBe('5m ago')
    expect(timeAgo('2026-01-10T09:00:00Z', now)).toBe('3h ago')
    expect(timeAgo('2026-01-08T12:00:00Z', now)).toBe('2d ago')
  })
  it('returns empty for invalid input', () => {
    expect(timeAgo('nope', now)).toBe('')
  })
})
