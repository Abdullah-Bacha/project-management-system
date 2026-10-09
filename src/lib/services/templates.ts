import { Project, ProjectTemplate, Task, Team } from '@/lib/db/models'
import { blueprintsFromTasks, dueDateFor, offsetBaseDay } from '@/lib/templates'
import { PROJECT_POPULATE, composeMembers, syncProjectProgress, teamRoster } from '@/lib/services/projects'
import { notifyProjectAssigned } from '@/lib/services/notifications'
import { recordActivity } from '@/lib/services/activity'
import { dateOnly, parseDueDate } from '@/lib/due-date'
import type { ProjectTemplate as TemplateDto, TaskBlueprint, TaskPriority, UseTemplateInput } from '@/types'

const idOf = (value: any): string => String(value?._id ?? value)

/** What a client sees of a template: the fields it owns, never the owner or the lookup key. */
export function toTemplateDto(doc: any): TemplateDto {
  const t = typeof doc.toObject === 'function' ? doc.toObject() : doc
  return {
    _id: idOf(t._id),
    name: t.name,
    description: t.description || undefined,
    category: t.category || undefined,
    projectDescription: t.projectDescription || undefined,
    requirements: t.requirements || undefined,
    tasks: (t.tasks ?? []).map((b: any) => ({
      title: b.title,
      ...(b.description && { description: b.description }),
      priority: (b.priority ?? 'medium') as TaskPriority,
      ...(typeof b.dueOffsetDays === 'number' && { dueOffsetDays: b.dueOffsetDays }),
    })),
    createdAt: new Date(t.createdAt).toISOString(),
    updatedAt: new Date(t.updatedAt).toISOString(),
  }
}

/** The case-insensitive name a template is unique by, per owner. */
export const nameKeyOf = (name: string) => name.trim().toLowerCase()

/** Every task the template makes, ready to insert into the new project: To Do, unassigned, in order. */
export function buildTasks(blueprints: TaskBlueprint[], opts: { projectId: unknown; createdBy: string; baseDay: string }) {
  return blueprints.map((b, order) => ({
    title: b.title,
    description: b.description ?? '',
    priority: b.priority ?? 'medium',
    dueDate: dueDateFor(opts.baseDay, b.dueOffsetDays),
    projectId: opts.projectId,
    createdBy: opts.createdBy,
    status: 'todo' as const,
    actualHours: 0,
    order,
  }))
}

export type InstantiateResult =
  | { ok: true; project: any; tasksCreated: number; duplicate: boolean }
  | { ok: false; status: 404 | 500; error: string }

/**
 * Create a new project, and its tasks, from one of the caller's templates.
 *
 * Mongo transactions are not used anywhere in this app, so consistency is kept
 * the way the rest of it does: validate everything first, then write in an
 * order that can be undone. If inserting the tasks fails, the project and the
 * tasks of THIS request (found by the new project's id, which nothing else
 * has) are removed and the caller is told nothing was created. Notifications
 * and activity are written only after everything succeeded, so there is
 * nothing of theirs to undo.
 *
 * A repeated request (same `requestId`) returns the project the first one made.
 */
export async function createProjectFromTemplate(params: {
  templateId: string
  ownerId: string
  input: UseTemplateInput
  serverToday: string
}): Promise<InstantiateResult> {
  const { templateId, ownerId, input, serverToday } = params

  // The owner is part of the lookup: another admin's template is simply "not found".
  const template: any = await ProjectTemplate.findOne({ _id: templateId, createdBy: ownerId }).lean()
  if (!template) return { ok: false, status: 404, error: 'Template not found' }

  const existing = await Project.findOne({ owner: ownerId, creationKey: input.requestId })
  if (existing) return finished(existing, await Task.countDocuments({ projectId: existing._id }), true)

  const team: any = input.teamId ? await Team.findById(input.teamId) : null
  if (input.teamId && !team) return { ok: false, status: 404, error: 'Team not found' }

  const blueprints: TaskBlueprint[] = (template.tasks ?? []).map((b: any) => ({
    title: b.title,
    description: b.description || undefined,
    priority: b.priority,
    dueOffsetDays: b.dueOffsetDays,
  }))

  const startDate = input.startDate ? parseDueDate(input.startDate) : null
  const deadline = input.deadline ? parseDueDate(input.deadline) : null
  const baseDay = offsetBaseDay({ startDate: input.startDate, today: input.today }, serverToday)

  let project: any
  try {
    project = await Project.create({
      title: input.title,
      description: input.description ?? template.projectDescription ?? '',
      requirements: input.requirements ?? template.requirements ?? '',
      ...(startDate && { startDate }),
      ...(deadline && { deadline }),
      owner: ownerId,
      team: team?._id,
      members: composeMembers(ownerId, [], team),
      progress: 0,
      creationKey: input.requestId,
    })
  } catch (error: any) {
    if (error?.code === 11000) {
      // A twin of this request won the race: hand back its project.
      const first = await Project.findOne({ owner: ownerId, creationKey: input.requestId })
      if (first) return finished(first, await Task.countDocuments({ projectId: first._id }), true)
    }
    throw error
  }

  try {
    if (blueprints.length > 0) {
      await Task.insertMany(buildTasks(blueprints, { projectId: project._id, createdBy: ownerId, baseDay }))
    }
  } catch (error) {
    console.error('[templates] creating tasks failed, undoing the new project:', error)
    try {
      // Only what this request created: the tasks of the brand-new project, then the project itself.
      await Task.deleteMany({ projectId: project._id })
      await Project.deleteOne({ _id: project._id })
    } catch (undoError) {
      console.error('[templates] undo failed:', undoError)
      return {
        ok: false,
        status: 500,
        error: `Creating the tasks failed and the new project "${input.title}" could not be removed automatically. Delete it from the projects list and try again.`,
      }
    }
    return { ok: false, status: 500, error: 'The project could not be created from this template, and nothing was created. Please try again.' }
  }

  await syncProjectProgress(project._id)
  if (team) await notifyProjectAssigned(project, teamRoster(team), ownerId)

  // The same entry a normal task creation leaves, one per task (the feed is project-scoped).
  const created: any[] = blueprints.length ? await Task.find({ projectId: project._id }).select('_id').lean() : []
  await Promise.all(created.map((t) => recordActivity({ projectId: project._id, actorId: ownerId, type: 'TASK_CREATED', taskId: t._id })))

  return finished(project, blueprints.length, false)
}

async function finished(project: any, tasksCreated: number, duplicate: boolean): Promise<InstantiateResult> {
  await project.populate(PROJECT_POPULATE)
  return { ok: true, project, tasksCreated, duplicate }
}

/** Blueprints for "save this project as a template": structure only (see blueprintsFromTasks). */
export async function blueprintsFromProject(project: any) {
  const tasks = await Task.find({ projectId: project._id })
    .sort({ order: 1, _id: 1 })
    .limit(200)
    .select('title description priority dueDate')
    .lean()
  const baseDay = dateOnly(project.startDate) || dateOnly(project.createdAt)
  return blueprintsFromTasks(tasks, baseDay)
}
