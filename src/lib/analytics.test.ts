import { describe, it, expect } from 'vitest'
import {
  addDays,
  buildTrend,
  completionRate,
  daysInRange,
  isValidTimeZone,
  rangeInstants,
  resolveRange,
  summarizeTasks,
  weekStart,
  zonedDayStart,
  type SnapshotGroup,
} from './analytics'
import { workloadStatus } from './workload'

const P1 = 'p1'
const P2 = 'p2'
const projects = [
  { _id: P1, title: 'Alpha' },
  { _id: P2, title: 'Beta' },
]

const g = (
  projectId: string,
  status: SnapshotGroup['_id']['status'],
  count: number,
  extra: Partial<SnapshotGroup['_id']> = {}
): SnapshotGroup => ({ _id: { projectId, status, priority: 'medium', age: 'none', noStamp: false, ...extra }, count })

describe('completionRate', () => {
  it('is 0 for no tasks (no division by zero) and never NaN or negative', () => {
    expect(completionRate(0, 0)).toBe(0)
    expect(completionRate(5, 0)).toBe(0)
    expect(completionRate(-2, 10)).toBe(0)
    expect(Number.isNaN(completionRate(0, 0))).toBe(false)
  })
  it('is completed ÷ total as a whole percent, capped at 100', () => {
    expect(completionRate(1, 3)).toBe(33)
    expect(completionRate(2, 3)).toBe(67)
    expect(completionRate(4, 4)).toBe(100)
    expect(completionRate(9, 4)).toBe(100)
  })
})

describe('summarizeTasks', () => {
  it('an empty dataset gives zeros everywhere', () => {
    const s = summarizeTasks([], [], new Map())
    expect(s.totals).toEqual({ tasks: 0, completed: 0, active: 0, inReview: 0, overdue: 0, blocked: 0, completionRate: 0 })
    expect(s.status).toEqual({ todo: 0, 'in-progress': 0, review: 0, complete: 0 })
    expect(s.priority).toEqual({ low: 0, medium: 0, high: 0, urgent: 0 })
  })

  it('a project with no tasks is listed with 0% (not hidden, not NaN)', () => {
    const s = summarizeTasks([g(P1, 'todo', 2)], projects, new Map())
    const beta = s.projectRows.find((r) => r._id === P2)!
    expect(beta).toMatchObject({ total: 0, completed: 0, active: 0, completionRate: 0 })
  })

  it('counts statuses, active, in-review and completion', () => {
    const s = summarizeTasks(
      [g(P1, 'todo', 2), g(P1, 'in-progress', 3), g(P1, 'review', 1), g(P1, 'complete', 4), g(P2, 'complete', 1)],
      projects,
      new Map()
    )
    expect(s.status).toEqual({ todo: 2, 'in-progress': 3, review: 1, complete: 5 })
    expect(s.totals).toMatchObject({ tasks: 11, completed: 5, active: 6, inReview: 1, completionRate: 45 })
    expect(s.projectRows.find((r) => r._id === P1)).toMatchObject({ total: 10, completed: 4, active: 6, completionRate: 40 })
    expect(s.projectRows.find((r) => r._id === P2)).toMatchObject({ total: 1, completionRate: 100 })
  })

  it('counts the priority distribution across every status', () => {
    const s = summarizeTasks(
      [g(P1, 'todo', 2, { priority: 'low' }), g(P1, 'complete', 1, { priority: 'urgent' }), g(P2, 'review', 3, { priority: 'high' })],
      projects,
      new Map()
    )
    expect(s.priority).toEqual({ low: 2, medium: 0, high: 3, urgent: 1 })
  })

  it('only active tasks past their due day are overdue; the age bands add up', () => {
    const s = summarizeTasks(
      [
        g(P1, 'todo', 2, { age: '1-3', priority: 'high' }),
        g(P1, 'in-progress', 1, { age: '4-7' }),
        g(P2, 'review', 1, { age: '8+', priority: 'urgent' }),
        g(P2, 'todo', 5), // due today / later / none: age 'none'
        // A finished task is never overdue even if the query tagged it.
        g(P2, 'complete', 4, { age: '8+' }),
      ],
      projects,
      new Map()
    )
    expect(s.totals.overdue).toBe(4)
    expect(s.overdue.byAge).toEqual({ '1-3': 2, '4-7': 1, '8+': 1 })
    expect(s.overdue.byPriority).toEqual({ low: 0, medium: 1, high: 2, urgent: 1 })
    expect(s.overdue.byProject).toEqual([
      { _id: P1, title: 'Alpha', count: 3 },
      { _id: P2, title: 'Beta', count: 1 },
    ])
  })

  it('blocked comes from the dependency count per project, each task once', () => {
    const s = summarizeTasks([g(P1, 'todo', 4)], projects, new Map([[P1, 2]]))
    expect(s.totals.blocked).toBe(2)
    expect(s.projectRows.find((r) => r._id === P1)!.blocked).toBe(2)
  })

  it('ignores groups outside the selected projects', () => {
    const s = summarizeTasks([g('other', 'todo', 99), g(P1, 'todo', 1)], projects, new Map())
    expect(s.totals.tasks).toBe(1)
  })

  it('reports completed tasks without a completion date instead of inventing one', () => {
    const s = summarizeTasks([g(P1, 'complete', 3, { noStamp: true }), g(P1, 'complete', 2)], projects, new Map())
    expect(s.completedWithoutTimestamp).toBe(3)
    expect(s.totals.completed).toBe(5)
  })
})

describe('date range', () => {
  const today = '2026-10-09'

  it('defaults to the last 30 days ending today', () => {
    expect(resolveRange({ today })).toEqual({ ok: true, from: '2026-09-10', to: today, days: 30 })
  })
  it('accepts a custom range (inclusive of both ends)', () => {
    expect(resolveRange({ from: '2026-10-01', to: '2026-10-07', today })).toEqual({ ok: true, from: '2026-10-01', to: '2026-10-07', days: 7 })
  })
  it('rejects a start after the end', () => {
    expect(resolveRange({ from: '2026-10-08', to: '2026-10-01', today }).ok).toBe(false)
  })
  it('rejects impossible calendar dates and non-dates', () => {
    expect(resolveRange({ from: '2026-02-30', today }).ok).toBe(false)
    expect(resolveRange({ to: '2026-13-01', today }).ok).toBe(false)
    expect(resolveRange({ from: '10/01/2026', today }).ok).toBe(false)
  })
  it('caps the span', () => {
    expect(resolveRange({ from: '2024-01-01', to: '2026-01-01', today }).ok).toBe(false)
    expect(resolveRange({ from: '2025-10-09', to: '2026-10-09', today }).ok).toBe(true)
  })
  it('date arithmetic stays on calendar days across month ends and leap days', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(daysInRange('2026-10-01', '2026-10-01')).toBe(1)
    expect(weekStart('2026-10-09')).toBe('2026-10-05') // a Friday → its Monday
    expect(weekStart('2026-10-11')).toBe('2026-10-05') // Sunday belongs to the week before Monday
  })
})

describe('buildTrend', () => {
  it('fills every day with zeros and places counts on their day', () => {
    const t = buildTrend(
      { from: '2026-10-01', to: '2026-10-05', days: 5 },
      new Map([['2026-10-02', 3]]),
      new Map([['2026-10-04', 2]])
    )
    expect(t.granularity).toBe('day')
    expect(t.points.map((p) => p.start)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'])
    expect(t.points.map((p) => p.created)).toEqual([0, 3, 0, 0, 0])
    expect(t.points.map((p) => p.completed)).toEqual([0, 0, 0, 2, 0])
  })

  it('no completions at all means all zeros: nothing is fabricated', () => {
    const t = buildTrend({ from: '2026-10-01', to: '2026-10-03', days: 3 }, new Map(), new Map())
    expect(t.points.every((p) => p.created === 0 && p.completed === 0)).toBe(true)
  })

  it('sums per week for long ranges, without losing or duplicating counts', () => {
    const from = '2026-08-01'
    const to = '2026-10-09' // 70 days
    const days = daysInRange(from, to)
    const t = buildTrend({ from, to, days }, new Map([['2026-08-03', 1], ['2026-08-09', 2], ['2026-08-10', 4]]), new Map())
    expect(t.granularity).toBe('week')
    expect(t.points.reduce((n, p) => n + p.created, 0)).toBe(7)
    // 3 Aug (Mon) and 9 Aug (Sun) share the week of 3 Aug; 10 Aug starts the next.
    expect(t.points.find((p) => p.start === '2026-08-03')!.created).toBe(3)
    expect(t.points.find((p) => p.start === '2026-08-10')!.created).toBe(4)
  })
})

describe('workload categories (Feature #12 thresholds are reused, not redefined)', () => {
  it.each([
    [0, 'available'],
    [1, 'normal'],
    [3, 'normal'],
    [4, 'high'],
    [6, 'high'],
    [7, 'overloaded'],
  ])('%i active tasks → %s', (n, expected) => {
    expect(workloadStatus(n)).toBe(expected)
  })
})

describe('time zones (a range is local days; events are instants)', () => {
  it('knows real IANA zones and rejects the rest', () => {
    for (const z of ['UTC', 'Asia/Karachi', 'America/New_York', 'Pacific/Auckland']) expect(isValidTimeZone(z)).toBe(true)
    for (const z of ['', 'Mars/Base', '../etc', '{"$ne":1}', 'a'.repeat(80)]) expect(isValidTimeZone(z)).toBe(false)
  })

  it('UTC is the default and a day starts at 00:00Z', () => {
    expect(zonedDayStart('2026-10-09').toISOString()).toBe('2026-10-09T00:00:00.000Z')
    expect(zonedDayStart('2026-10-09', 'UTC').toISOString()).toBe('2026-10-09T00:00:00.000Z')
  })

  it('a zone east of UTC starts its day earlier in UTC (Karachi is +05:00)', () => {
    expect(zonedDayStart('2026-10-09', 'Asia/Karachi').toISOString()).toBe('2026-10-08T19:00:00.000Z')
  })

  it('a zone west of UTC starts its day later in UTC (New York is -04:00 in October, -05:00 in January)', () => {
    expect(zonedDayStart('2026-10-09', 'America/New_York').toISOString()).toBe('2026-10-09T04:00:00.000Z')
    expect(zonedDayStart('2026-01-15', 'America/New_York').toISOString()).toBe('2026-01-15T05:00:00.000Z')
  })

  it('follows daylight-saving changes inside a range', () => {
    // US clocks went forward on 2026-03-08: that local day is only 23 hours long.
    const start = zonedDayStart('2026-03-08', 'America/New_York')
    const next = zonedDayStart('2026-03-09', 'America/New_York')
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z')
    expect(next.toISOString()).toBe('2026-03-09T04:00:00.000Z')
    expect(next.getTime() - start.getTime()).toBe(23 * 3_600_000)
  })

  it('a range covers its first midnight up to, not including, the midnight after its last day', () => {
    const { start, endExclusive } = rangeInstants({ from: '2026-10-01', to: '2026-10-07' }, 'Asia/Karachi')
    expect(start.toISOString()).toBe('2026-09-30T19:00:00.000Z')
    expect(endExclusive.toISOString()).toBe('2026-10-07T19:00:00.000Z')
    const inRange = (iso: string) => Date.parse(iso) >= start.getTime() && Date.parse(iso) < endExclusive.getTime()
    // 01:00 local on 1 Oct is 20:00Z on 30 Sep: inside for a Karachi viewer (it would be outside a UTC range).
    expect(inRange('2026-09-30T20:00:00Z')).toBe(true)
    expect(inRange('2026-09-30T18:59:59Z')).toBe(false)
    // 23:30 local on 7 Oct is 18:30Z: still inside; 00:00 local on 8 Oct is not.
    expect(inRange('2026-10-07T18:30:00Z')).toBe(true)
    expect(inRange('2026-10-07T19:00:00Z')).toBe(false)
  })

  it('the same instant is a different local day for different viewers, and each range agrees with itself', () => {
    const instant = Date.parse('2026-10-08T21:30:00Z') // 02:30 on 9 Oct in Karachi, 17:30 on 8 Oct in New York
    const day = (zone: string, d: string) => {
      const { start, endExclusive } = rangeInstants({ from: d, to: d }, zone)
      return instant >= start.getTime() && instant < endExclusive.getTime()
    }
    expect(day('Asia/Karachi', '2026-10-09')).toBe(true)
    expect(day('Asia/Karachi', '2026-10-08')).toBe(false)
    expect(day('America/New_York', '2026-10-08')).toBe(true)
    expect(day('America/New_York', '2026-10-09')).toBe(false)
    expect(day('UTC', '2026-10-08')).toBe(true)
  })

  it('a leap day and a month end are single days in any zone', () => {
    const { start, endExclusive } = rangeInstants({ from: '2028-02-29', to: '2028-02-29' }, 'Asia/Karachi')
    expect(endExclusive.getTime() - start.getTime()).toBe(86_400_000)
    expect(zonedDayStart('2026-03-01', 'Asia/Karachi').toISOString()).toBe('2026-02-28T19:00:00.000Z')
  })
})
