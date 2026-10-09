import type { WorkloadStatus } from '@/lib/workload'

/** One developer's open and finished work, counted from their tasks. */
export interface DeveloperWorkload {
  _id: string
  name: string
  /** The team this person is on (from the team's roster, never guessed from their tasks). */
  teamId: string
  /** To Do + In Progress + In Review. */
  activeTasks: number
  todo: number
  inProgress: number
  inReview: number
  completed: number
  totalTasks: number
  /** Active tasks whose due day has passed. */
  overdue: number
  /** Active tasks of that priority. */
  high: number
  urgent: number
  workloadStatus: WorkloadStatus
}

export interface WorkloadSummary {
  members: number
  activeTasks: number
  inReview: number
  overdue: number
}

export interface WorkloadReport {
  summary: WorkloadSummary
  developers: DeveloperWorkload[]
  /** What the caller can choose to filter by. */
  teams: { _id: string; name: string }[]
  projects: { _id: string; title: string; teamId: string | null }[]
}
