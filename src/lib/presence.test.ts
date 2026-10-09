import { describe, it, expect } from 'vitest'
import { HEARTBEAT_MS, LEAVE_GRACE_MS, STALE_MS, TAB_ID_PATTERN, isSessionConnected, onlineUserIds, presenceCounts } from './presence'

const NOW = Date.parse('2026-10-09T10:00:00Z')
const ago = (ms: number) => new Date(NOW - ms)

describe('timing rules', () => {
  it('the stale timeout is comfortably longer than a heartbeat (browsers slow background tabs)', () => {
    expect(STALE_MS).toBeGreaterThanOrEqual(HEARTBEAT_MS * 3)
    expect(STALE_MS).toBeGreaterThan(60_000) // a hidden tab may only run its timers about once a minute
  })
})

describe('isSessionConnected', () => {
  it('a tab that just reported is connected', () => {
    expect(isSessionConnected({ lastBeatAt: ago(1_000) }, NOW)).toBe(true)
  })
  it('stays connected up to the stale timeout, and no longer', () => {
    expect(isSessionConnected({ lastBeatAt: ago(STALE_MS) }, NOW)).toBe(true)
    expect(isSessionConnected({ lastBeatAt: ago(STALE_MS + 1) }, NOW)).toBe(false)
  })
  it('a tab that vanished without saying goodbye (crash, power loss) expires by itself', () => {
    expect(isSessionConnected({ lastBeatAt: ago(10 * 60_000) }, NOW)).toBe(false)
  })
  it('a tab that said goodbye is gone once the refresh grace passes', () => {
    expect(isSessionConnected({ lastBeatAt: ago(1_000), leftAt: ago(LEAVE_GRACE_MS + 1) }, NOW)).toBe(false)
  })
  it('a tab that just said goodbye still counts briefly, so a page refresh does not flash Offline', () => {
    expect(isSessionConnected({ lastBeatAt: ago(1_000), leftAt: ago(2_000) }, NOW)).toBe(true)
  })
  it('a goodbye wins over a fresh heartbeat time', () => {
    expect(isSessionConnected({ lastBeatAt: ago(500), leftAt: ago(60_000) }, NOW)).toBe(false)
  })
  it('accepts dates, ISO strings and numbers', () => {
    expect(isSessionConnected({ lastBeatAt: ago(1_000).toISOString() }, NOW)).toBe(true)
    expect(isSessionConnected({ lastBeatAt: NOW - 1_000 }, NOW)).toBe(true)
  })
})

describe('onlineUserIds', () => {
  it('one connected tab is enough', () => {
    expect(onlineUserIds([{ userId: 'u1', lastBeatAt: ago(1_000) }], NOW).has('u1')).toBe(true)
  })

  it('several tabs: closing one does not take the person offline while another is connected', () => {
    const sessions = [
      { userId: 'u1', lastBeatAt: ago(1_000), leftAt: ago(60_000) }, // closed
      { userId: 'u1', lastBeatAt: ago(2_000) }, // still open
    ]
    expect(onlineUserIds(sessions, NOW).has('u1')).toBe(true)
  })

  it('all tabs closed or expired means offline', () => {
    const sessions = [
      { userId: 'u1', lastBeatAt: ago(1_000), leftAt: ago(60_000) },
      { userId: 'u1', lastBeatAt: ago(5 * 60_000) },
    ]
    expect(onlineUserIds(sessions, NOW).has('u1')).toBe(false)
  })

  it('people are independent of each other', () => {
    const online = onlineUserIds([{ userId: 'u1', lastBeatAt: ago(1_000) }, { userId: 'u2', lastBeatAt: ago(10 * 60_000) }], NOW)
    expect([...online]).toEqual(['u1'])
  })

  it('understands populated or object ids', () => {
    expect(onlineUserIds([{ userId: { _id: 'u9' }, lastBeatAt: ago(1_000) }], NOW).has('u9')).toBe(true)
  })

  it('no sessions means nobody is online', () => {
    expect(onlineUserIds([], NOW).size).toBe(0)
  })
})

describe('presenceCounts', () => {
  it('counts online and offline over everyone, never negative', () => {
    expect(presenceCounts(['a', 'b', 'c', 'd'], new Set(['a', 'c']))).toEqual({ online: 2, offline: 2 })
    expect(presenceCounts([], new Set())).toEqual({ online: 0, offline: 0 })
    expect(presenceCounts(['a'], new Set(['someone-not-listed']))).toEqual({ online: 0, offline: 1 })
  })
})

describe('tab id format', () => {
  it.each(['3f2b8a1c-1111-4222-8333-444455556666', 'abcdefgh', 'A1-b2-C3-d4'])('accepts %s', (id) => {
    expect(TAB_ID_PATTERN.test(id)).toBe(true)
  })
  it.each(['', 'short', '../../etc/passwd', 'has space here', '{"$ne":1}', 'x'.repeat(65), 'a/b/c/d/e/f/g/h'])('refuses %j', (id) => {
    expect(TAB_ID_PATTERN.test(id)).toBe(false)
  })
})
