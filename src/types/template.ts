import type { TaskPriority } from './task'
import type { Project } from './project'

/** Limits shared by the API (which enforces them) and the form (which mirrors them). */
export const TEMPLATE_LIMITS = {
  name: { min: 3, max: 100 },
  description: 500,
  category: 50,
  projectDescription: 500,
  requirements: 5000,
  /** Tasks per template. */
  tasks: 50,
  /** Templates one admin may keep. */
  perOwner: 100,
  taskTitle: { min: 3, max: 200 },
  taskDescription: 2000,
  /** A due-date offset is a whole number of days from the project's start (0 = the start day itself). */
  dueOffsetDays: { min: 0, max: 730 },
} as const

/** One task a template creates. Only what normal task creation supports. */
export interface TaskBlueprint {
  title: string
  description?: string
  priority: TaskPriority
  /** Days after the new project's start day (or its creation day) that the task is due. */
  dueOffsetDays?: number
}

export interface ProjectTemplate {
  _id: string
  name: string
  description?: string
  category?: string
  projectDescription?: string
  requirements?: string
  tasks: TaskBlueprint[]
  createdAt: string
  updatedAt: string
}

/** What a client may send to create or replace a template. */
export type TemplateInput = Omit<ProjectTemplate, '_id' | 'createdAt' | 'updatedAt'>

export interface UseTemplateInput {
  title: string
  description?: string
  requirements?: string
  /** YYYY-MM-DD */
  startDate?: string
  deadline?: string
  teamId?: string
  /** The viewer's calendar date, the base of due-date offsets when there is no start date. */
  today?: string
  /** One per attempt; a repeated request with the same key returns the first project instead of making another. */
  requestId: string
}

export interface UseTemplateResult {
  project: Project
  tasksCreated: number
  /** True when this was a repeat of a request that already created the project. */
  duplicate: boolean
}
