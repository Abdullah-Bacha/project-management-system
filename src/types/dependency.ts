import type { TaskPriority, TaskStatus } from './task'

/** The few fields the dependency list needs about a related task. */
export interface DependencyTask {
  _id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string
  assignee: { _id: string; name: string } | null
}

/** One relationship, seen from the task being looked at. */
export interface DependencyEntry {
  /** The relationship's id (what removing it needs). */
  _id: string
  task: DependencyTask
}

/** GET /api/tasks/:id/dependencies. */
export interface TaskDependencies {
  /** Tasks that must finish first. */
  blockedBy: DependencyEntry[]
  /** Tasks that wait for this one. */
  blocks: DependencyEntry[]
  /** Blockers that are not Complete yet. */
  unresolved: number
}
