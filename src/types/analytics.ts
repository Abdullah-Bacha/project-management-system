import type { TaskPriority, TaskStatus } from './task'
import type { WorkloadStatus } from '@/lib/workload'
import type { DeveloperWorkload } from './workload'

/** How long past its due day an open task is: 1–3, 4–7 or more than 7 days. */
export const OVERDUE_AGES = ['1-3', '4-7', '8+'] as const
export type OverdueAge = (typeof OVERDUE_AGES)[number]

export interface AnalyticsOverview {
  /** Projects inside the selected scope (team / project filter applied). */
  projects: number
  tasks: number
  completed: number
  /** To Do + In Progress + In Review. */
  active: number
  inReview: number
  /** Active tasks whose due day is before the viewer's today. */
  overdue: number
  /** Completed ÷ total tasks, 0 when there are no tasks. Whole percent. */
  completionRate: number
  /** Active tasks with at least one unfinished blocker (each counted once). */
  blocked: number
  /** Within the selected date range. */
  createdInPeriod: number
  completedInPeriod: number
}

export interface TrendPoint {
  /** First day of the bucket, YYYY-MM-DD (a day in the report's time zone). */
  start: string
  created: number
  completed: number
}

export interface AnalyticsTrend {
  granularity: 'day' | 'week'
  points: TrendPoint[]
  /** Completed tasks that carry no completion date; they are not in the trend. */
  completedWithoutTimestamp: number
}

export interface ProjectPerformance {
  _id: string
  title: string
  total: number
  completed: number
  active: number
  inReview: number
  overdue: number
  blocked: number
  completionRate: number
}

export interface TeamPerformance {
  _id: string
  name: string
  developers: number
  activeTasks: number
  inReview: number
  completed: number
  overdue: number
  blocked: number
  /** How many of the team's developers sit in each Feature #12 workload band. */
  workload: Record<WorkloadStatus, number>
}

export interface OverdueTask {
  _id: string
  title: string
  priority: TaskPriority
  dueDate: string
  projectId: string
  projectTitle: string
  assignee: string | null
}

export interface BlockedTask {
  _id: string
  title: string
  priority: TaskPriority
  projectId: string
  projectTitle: string
  openBlockers: number
  /** A few of the unfinished prerequisites it is waiting on. */
  waitingOn: { _id: string; title: string; status: TaskStatus }[]
}

export interface CountByProject {
  _id: string
  title: string
  count: number
}

export interface AnalyticsReport {
  range: { from: string; to: string; days: number; today: string; timeZone: string }
  options: {
    teams: { _id: string; name: string }[]
    projects: { _id: string; title: string; teamId: string | null }[]
  }
  overview: AnalyticsOverview
  status: Record<TaskStatus, number>
  priority: Record<TaskPriority, number>
  trend: AnalyticsTrend
  projects: ProjectPerformance[]
  teams: TeamPerformance[]
  /** Each team member's open work (Team Workload's numbers), A–Z. Capacity signals, not scores. */
  developers: DeveloperWorkload[]
  overdue: {
    total: number
    byProject: CountByProject[]
    byPriority: Record<TaskPriority, number>
    byAge: Record<OverdueAge, number>
    /** The longest-overdue open tasks (capped); `total` is the full count. */
    tasks: OverdueTask[]
  }
  blocked: {
    total: number
    byProject: CountByProject[]
    byPriority: Record<TaskPriority, number>
    /** Tasks waiting on the most unfinished prerequisites (capped). */
    top: BlockedTask[]
  }
}
