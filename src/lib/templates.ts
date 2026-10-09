import { dateOnly, isValidDateOnly } from '@/lib/due-date'
import { addDays } from '@/lib/analytics'
import { TASK_PRIORITIES, type TaskBlueprint, type TaskPriority, TEMPLATE_LIMITS } from '@/types'

/**
 * Pure rules of Project Templates, shared by the API and tests.
 *
 * DUE-DATE RULE (one rule, used everywhere): a blueprint with `dueOffsetDays: n`
 * becomes a task due on  (the new project's start day, or — when it has none —
 * the day it is created, as the viewer's own calendar date)  +  n calendar days.
 * The result is a plain day stored at 00:00 UTC, exactly like any other task due
 * date (Feature #10). A blueprint without an offset gets no due date. The old
 * project's absolute dates are never copied.
 */
export function dueDateFor(baseDay: string, offsetDays?: number | null): Date | undefined {
  if (offsetDays === undefined || offsetDays === null) return undefined
  if (!isValidDateOnly(baseDay) || !Number.isInteger(offsetDays) || offsetDays < 0) return undefined
  return new Date(`${addDays(baseDay, offsetDays)}T00:00:00Z`)
}

/** The day offsets count from: the start date if the project has one, else the creation day. */
export function offsetBaseDay(input: { startDate?: string; today?: string }, serverToday: string): string {
  if (input.startDate && isValidDateOnly(input.startDate)) return input.startDate
  if (input.today && isValidDateOnly(input.today)) return input.today
  return serverToday
}

const clean = (value: unknown, max: number): string | undefined => {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text.slice(0, max) : undefined
}

/**
 * Turn a project's tasks into blueprints, keeping ONLY reusable structure:
 * title, description, priority, and — when it is unambiguous — how many days
 * after the project's start the task was due. Statuses, assignees, ids, dates,
 * timestamps, comments and dependencies are not read at all.
 *
 * The offset is unambiguous when the task has a due day on or after the base
 * day (project start, else the day it was created) and within the allowed span.
 */
export function blueprintsFromTasks(
  tasks: { title?: unknown; description?: unknown; priority?: unknown; dueDate?: unknown }[],
  baseDay: string
): { blueprints: TaskBlueprint[]; truncated: boolean } {
  const blueprints: TaskBlueprint[] = []
  for (const task of tasks) {
    if (blueprints.length >= TEMPLATE_LIMITS.tasks) break
    const title = clean(task.title, TEMPLATE_LIMITS.taskTitle.max)
    if (!title || title.length < TEMPLATE_LIMITS.taskTitle.min) continue

    const priority = (TASK_PRIORITIES as readonly string[]).includes(task.priority as string) ? (task.priority as TaskPriority) : 'medium'
    const blueprint: TaskBlueprint = { title, priority }

    const description = clean(task.description, TEMPLATE_LIMITS.taskDescription)
    if (description) blueprint.description = description

    const due = dateOnly(task.dueDate as string | Date | undefined)
    if (due && isValidDateOnly(baseDay) && due >= baseDay) {
      const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${baseDay}T00:00:00Z`)) / 86_400_000)
      if (days <= TEMPLATE_LIMITS.dueOffsetDays.max) blueprint.dueOffsetDays = days
    }
    blueprints.push(blueprint)
  }
  return { blueprints, truncated: tasks.length > blueprints.length && blueprints.length >= TEMPLATE_LIMITS.tasks }
}
