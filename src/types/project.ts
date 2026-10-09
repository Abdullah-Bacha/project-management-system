import type { UserSummary } from './user'
import type { ReferenceLink } from './project-resources'

export const PROJECT_STATUSES = ['active', 'archived', 'completed'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export interface Team {
  _id: string
  name: string
  description?: string
  teamLeader: UserSummary
  members: UserSummary[]
  createdBy?: UserSummary
  createdAt: string
  updatedAt: string
  /** Only on GET /api/teams/mine: what the team is currently staffed on. */
  projects?: { _id: string; title: string; status: ProjectStatus }[]
}

/** What the server says the caller may do with a project (GET /projects/:id). */
export interface ProjectCapabilities {
  canEdit: boolean
  canManageMembers: boolean
  canDelete: boolean
  canAssignTeam: boolean
}

/** A project as the API returns it: owner, members and team are populated. */
export interface Project {
  _id: string
  title: string
  description?: string
  requirements?: string
  owner: UserSummary
  team?: Team
  members: UserSummary[]
  /** Reference material shared with everyone on the project. */
  referenceLinks?: ReferenceLink[]
  status: ProjectStatus
  progress: number
  startDate?: string
  deadline?: string
  createdAt: string
  updatedAt: string
  /** Present on single-project responses only. */
  capabilities?: ProjectCapabilities
}

export interface ProjectAnalytics {
  tasksByStatus: Record<'todo' | 'in-progress' | 'review' | 'complete', number>
  completionRate: number
  totalTasks: number
  completedTasks: number
  overdueTasks: number
  highPriorityTasks: number
  totalEstimatedHours: number
  totalActualHours: number
}

export interface Report {
  _id: string
  project: { _id: string; title: string } | null
  team?: { _id: string; name: string } | string
  submittedBy: { _id: string; name: string; email: string }
  note?: string
  completedToday: { task: string; title: string }[]
  totalTasks: number
  completedTasks: number
  completionRate: number
  createdAt: string
}
