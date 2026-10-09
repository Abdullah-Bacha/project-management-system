import type { UserSummary } from './user'

export const TASK_STATUSES = ['todo', 'in-progress', 'review', 'complete'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

/** A task as the API returns it: assignee and creator are populated. */
export interface Task {
  _id: string
  projectId: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  assignedTo?: UserSummary | null
  createdBy: UserSummary
  tags?: string[]
  dueDate?: string
  estimatedHours?: number
  actualHours: number
  /** When the assignee first moved it to In Progress (server time). */
  startedAt?: string
  /** When it reached Complete (server time). */
  completedAt?: string
  order: number
  /** Dependencies (informational, never a status): all blockers, and the ones not yet Complete. */
  blockedByCount?: number
  openBlockers?: number
  createdAt: string
  updatedAt: string
}

/** Fields accepted by POST /projects/:id/tasks and PUT /tasks/:id. */
export interface TaskPayload {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  assignedTo?: string | null
  dueDate?: string | null
  estimatedHours?: number
  actualHours?: number
}

/** A task assigned to the signed-in user, with the project it belongs to (GET /api/tasks/mine). */
export interface MyTask {
  _id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: string
  startedAt?: string
  completedAt?: string
  /** Name of whoever created/assigned the task. */
  assignedBy?: string
  project: { _id: string; title: string }
}

export interface MyTasksPage {
  tasks: MyTask[]
  /** All open tasks assigned to the user, not just the ones returned. */
  total: number
  /** Of those, how many are past their due date. */
  overdue: number
  /** The user's tasks per status (finished ones included), whatever the page returns. */
  counts: Record<TaskStatus, number>
}
