import type { ProjectStatus } from './project'
import type { TaskPriority, TaskStatus } from './task'
import type { UserRole } from './user'

/** What GET /api/search returns: a few matches per kind, only things the caller may see. */
export interface SearchResults {
  projects: { _id: string; title: string; status: ProjectStatus }[]
  tasks: {
    _id: string
    title: string
    status: TaskStatus
    priority: TaskPriority
    project: { _id: string; title: string }
  }[]
  /** Email is only included for admins, who may search the whole directory. */
  people: { _id: string; name: string; role: UserRole; email?: string }[]
}
