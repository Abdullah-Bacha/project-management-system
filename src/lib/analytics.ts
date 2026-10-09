import { isValidDateOnly } from '@/lib/due-date'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@/types/task'
import {
  OVERDUE_AGES,
  type CountByProject,
  type OverdueAge,
  type ProjectPerformance,
  type TrendPoint,
} from '@/types/analytics'

/**
 * The calculations behind Reports & Analytics. Pure functions: the database
 * only produces grouped counts, and everything the screens show is derived
 * here, so every rule can be tested without a database.
 *
 * Definitions (one place, used by every section):
 *   active      = To Do + In Progress + In Review
 *   completed   = Complete
 *   completion  = completed ÷ total tasks, whole percent, 0 when there are no tasks
 *                 (the same rule as a project's stored `progress`)
 *   overdue     = an active task whose due DAY is before the viewer's today
 *                 (Feature #10; a task due today is not overdue, a finished task never is)
 *   blocked     = an active task with at least one blocker that is not Complete (Feature #13)
 */

export const MAX_RANGE_DAYS = 366
export const DEFAULT_RANGE_DAYS = 30
/** Ranges longer than this are shown per week instead of per day. */
export const WEEKLY_FROM_DAYS = 31

const DAY_MS = 86_400_000

export const isActive = (status: TaskStatus) => status !== 'complete'

/** Completed ÷ total as a whole percent; 0 (never NaN or negative) when there is nothing to divide. */
export function completionRate(completed: number, total: number): number {
  if (!(total > 0) || !(completed > 0)) return 0
  return Math.min(100, Math.round((completed / total) * 100))
}

// ---------------------------------------------------------------- dates

const toUtcMs = (day: string) => Date.parse(`${day}T00:00:00Z`)
const fromUtcMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export const addDays = (day: string, n: number) => fromUtcMs(toUtcMs(day) + n * DAY_MS)

/** Whole days from `from` to `to`, both included. */
export const daysInRange = (from: string, to: string) => Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS) + 1

/** The Monday on or before a day (weeks run Monday–Sunday). */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay() // 0 = Sunday
  return addDays(day, -((dow + 6) % 7))
}

export type RangeCheck =
  | { ok: true; from: string; to: string; days: number }
  | { ok: false; error: string }

/**
 * The date range of a report. Both ends are calendar days; a missing end falls
 * back to "the last 30 days up to today". The start may not be after the end,
 * and the span is capped so one request cannot ask for years of daily points.
 */
export function resolveRange(input: { from?: string; to?: string; today: string }): RangeCheck {
  const { from: rawFrom, to: rawTo, today } = input
  if (rawFrom && !isValidDateOnly(rawFrom)) return { ok: false, error: 'Invalid start date' }
  if (rawTo && !isValidDateOnly(rawTo)) return { ok: false, error: 'Invalid end date' }

  const to = rawTo ?? today
  const from = rawFrom ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1))
  if (from > to) return { ok: false, error: 'Start date must not be after the end date' }

  const days = daysInRange(from, to)
  if (days > MAX_RANGE_DAYS) return { ok: false, error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` }
  return { ok: true, from, to, days }
}

// ------------------------------------------------------------ aggregation

/** One group of the task aggregation. */
export interface SnapshotGroup {
  _id: {
    projectId: unknown
    status: TaskStatus
    priority: TaskPriority
    /** 'none' unless this is an active task past its due day. */
    age: OverdueAge | 'none'
    /** A Complete task that has no completion date. */
    noStamp: boolean
  }
  count: number
}

const idOf = (value: any): string => String(value?._id ?? value)

const zeroed = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>

export function summarizeTasks(groups: SnapshotGroup[], projects: { _id: string; title: string }[], blockedByProject: Map<string, number>) {
  const status = zeroed(TASK_STATUSES)
  const priority = zeroed(TASK_PRIORITIES)
  const overdueByPriority = zeroed(TASK_PRIORITIES)
  const overdueByAge = zeroed(OVERDUE_AGES)
  const overdueByProject = new Map<string, number>()
  let completedWithoutTimestamp = 0

  const rows = new Map<string, ProjectPerformance>(
    projects.map((p) => [
      p._id,
      { _id: p._id, title: p.title, total: 0, completed: 0, active: 0, inReview: 0, overdue: 0, blocked: blockedByProject.get(p._id) ?? 0, completionRate: 0 },
    ])
  )

  for (const group of groups) {
    const row = rows.get(idOf(group._id.projectId))
    if (!row) continue // never count anything outside the selected projects

    const { status: s, priority: pr, age, noStamp } = group._id
    const n = group.count
    status[s] += n
    priority[pr] += n
    row.total += n

    if (s === 'complete') {
      row.completed += n
      if (noStamp) completedWithoutTimestamp += n
      continue
    }

    row.active += n
    if (s === 'review') row.inReview += n
    if (age !== 'none') {
      row.overdue += n
      overdueByPriority[pr] += n
      overdueByAge[age] += n
      overdueByProject.set(row._id, (overdueByProject.get(row._id) ?? 0) + n)
    }
  }

  const projectRows = [...rows.values()].map((r) => ({ ...r, completionRate: completionRate(r.completed, r.total) }))
  const sum = (pick: (r: ProjectPerformance) => number) => projectRows.reduce((n, r) => n + pick(r), 0)

  const toCounts = (m: Map<string, number>): CountByProject[] =>
    [...m.entries()]
      .map(([id, count]) => ({ _id: id, title: rows.get(id)?.title ?? '', count }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))

  const total = sum((r) => r.total)
  const completed = sum((r) => r.completed)

  return {
    status,
    priority,
    projectRows: projectRows.sort((a, b) => a.title.localeCompare(b.title)),
    totals: {
      tasks: total,
      completed,
      active: sum((r) => r.active),
      inReview: sum((r) => r.inReview),
      overdue: sum((r) => r.overdue),
      blocked: sum((r) => r.blocked),
      completionRate: completionRate(completed, total),
    },
    overdue: { byPriority: overdueByPriority, byAge: overdueByAge, byProject: toCounts(overdueByProject) },
    completedWithoutTimestamp,
  }
}

/**
 * The created / completed series for the range, from per-day counts, with
 * every day present (zero when nothing happened). Long ranges are summed per
 * week. A completed task with no completion date has no day, so it can never
 * appear here.
 */
export function buildTrend(
  range: { from: string; to: string; days: number },
  created: Map<string, number>,
  completed: Map<string, number>
): { granularity: 'day' | 'week'; points: TrendPoint[] } {
  const granularity = range.days > WEEKLY_FROM_DAYS ? 'week' : 'day'
  const bucket = (day: string) => (granularity === 'week' ? weekStart(day) : day)

  const points = new Map<string, TrendPoint>()
  for (let i = 0; i < range.days; i++) {
    const start = bucket(addDays(range.from, i))
    if (!points.has(start)) points.set(start, { start, created: 0, completed: 0 })
  }
  for (const [day, n] of created) {
    const point = points.get(bucket(day))
    if (point) point.created += n
  }
  for (const [day, n] of completed) {
    const point = points.get(bucket(day))
    if (point) point.completed += n
  }
  return { granularity, points: [...points.values()] }
}

// ---------------------------------------------------------------- time zones
//
// Product rule: a *calendar date* (a due day, "today", the ends of a report
// range) is the viewer's own local date, and an *event time* (createdAt,
// completedAt) is an instant. To say which day an instant falls on, and which
// instants a range of local days covers, both are read in the viewer's time
// zone. Due dates themselves stay what Feature #10 says: a plain day, stored at
// 00:00 UTC and never shifted. Without a time zone everything is UTC.

export const DEFAULT_TIME_ZONE = 'UTC'

/** True for an IANA zone name this runtime knows (e.g. "Asia/Karachi", "America/New_York", "UTC"). */
export function isValidTimeZone(zone: string): boolean {
  if (!zone || zone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(zone)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** How far the zone's wall clock is ahead of UTC at an instant, in ms. */
function zoneOffsetMs(instant: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(instant / 1000) * 1000
}

/**
 * The instant a calendar day begins in a time zone (its local 00:00). Looked up
 * twice so a day whose start sits on the far side of a daylight-saving change is
 * still right.
 */
export function zonedDayStart(day: string, zone: string = DEFAULT_TIME_ZONE): Date {
  const wall = toUtcMs(day)
  let instant = wall - zoneOffsetMs(wall, zone)
  instant = wall - zoneOffsetMs(instant, zone)
  return new Date(instant)
}

/** The instants a range of local days covers: from its first midnight up to, not including, the midnight after its last day. */
export function rangeInstants(range: { from: string; to: string }, zone: string = DEFAULT_TIME_ZONE) {
  return { start: zonedDayStart(range.from, zone), endExclusive: zonedDayStart(addDays(range.to, 1), zone) }
}
