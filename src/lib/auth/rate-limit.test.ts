import { describe, it, expect, beforeEach } from 'vitest'
import {
  loginKeys,
  loginRetryAfter,
  recordLoginFailure,
  clearLoginFailures,
  resetLoginLimiter,
} from './rate-limit'

describe('login rate limiter', () => {
  beforeEach(() => resetLoginLimiter())

  it('does not block a first or occasional failure', () => {
    const keys = loginKeys('1.1.1.1', 'a@test.local')
    expect(loginRetryAfter(keys)).toBe(0)
    recordLoginFailure(keys)
    expect(loginRetryAfter(keys)).toBe(0)
  })

  it('blocks an account after repeated failures from one address, with a retry delay', () => {
    const keys = loginKeys('1.1.1.1', 'a@test.local')
    for (let i = 0; i < 8; i++) recordLoginFailure(keys)
    const wait = loginRetryAfter(keys)
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(15 * 60)
  })

  it('does not let one stranger lock others out of the same (e.g. demo) account', () => {
    const attacker = loginKeys('6.6.6.6', 'demo@test.local')
    for (let i = 0; i < 8; i++) recordLoginFailure(attacker)
    expect(loginRetryAfter(attacker)).toBeGreaterThan(0)

    const visitor = loginKeys('2.2.2.2', 'demo@test.local')
    expect(loginRetryAfter(visitor)).toBe(0)
  })

  it('blocks an address that sprays many different accounts', () => {
    for (let i = 0; i < 30; i++) recordLoginFailure(loginKeys('7.7.7.7', `user${i}@test.local`))
    expect(loginRetryAfter(loginKeys('7.7.7.7', 'fresh@test.local'))).toBeGreaterThan(0)
  })

  it('forgives earlier typos after a successful sign-in', () => {
    const keys = loginKeys('1.1.1.1', 'a@test.local')
    for (let i = 0; i < 7; i++) recordLoginFailure(keys)
    clearLoginFailures(keys)
    recordLoginFailure(keys)
    expect(loginRetryAfter(keys)).toBe(0)
  })

  it('treats email case as the same account', () => {
    expect(loginKeys('1.1.1.1', 'A@Test.local').account).toBe(loginKeys('1.1.1.1', 'a@test.local').account)
  })
})
