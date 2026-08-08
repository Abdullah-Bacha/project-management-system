import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/db/mongodb'
import { Project, Task, Team, User } from '@/lib/db/models'
import { authenticateRequest } from './middleware'
import { isProjectMember, isProjectOwner } from './membership'

export { isProjectMember, isProjectOwner }

/**
 * Authorization guards for project-scoped resources.
 *
 * `authenticateRequest` only proves *who* the caller is. Every route that
 * touches a project — or anything hanging off one — must additionally prove
 * the caller belongs to that project. Without this, any signed-in user can
 * read and mutate another user's data by guessing an id.
 *
 * Each guard returns `{ response }` on failure; return it verbatim from the
 * route. On success it returns the loaded document so the route need not
 * re-query.
 */

type Guard<T> = { response: NextResponse; data?: never } | { response?: never; data: T }

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

/** Deliberately 404, not 403: a non-member should not learn the id exists. */
const notFound = (what: string) =>
  NextResponse.json({ error: `${what} not found` }, { status: 404 })

const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

const badId = () => NextResponse.json({ error: 'Invalid id' }, { status: 400 })

/** Owner (admin who created the project) or the team_leader of its assigned team. */
async function isProjectEditor(project: any, userId: string): Promise<boolean> {
  if (isProjectOwner(project, userId)) return true
  if (!project.team) return false
  return Boolean(await Team.exists({ _id: project.team, teamLeader: userId }))
}

export interface ProjectContext {
  userId: string
  project: any
}

/**
 * Resolve the caller and the project, asserting membership.
 *
 * - `ownerOnly` gates destructive/administrative operations (delete, staffing,
 *   ad-hoc member changes) to the admin who created the project.
 * - `editorOnly` is broader: it additionally admits the team_leader of the
 *   project's currently-assigned team, since a team_leader runs their
 *   project's day-to-day content (description, requirements, status) even
 *   though only an admin controls who's staffed on it. This is checked
 *   against the team's live `teamLeader` field, not the caller's account
 *   role — if admin swaps who leads the team, edit rights move with the
 *   assignment immediately.
 */
export async function authorizeProject(
  request: NextRequest,
  projectId: string,
  options: { ownerOnly?: boolean; editorOnly?: boolean; populate?: string[] } = {}
): Promise<Guard<ProjectContext>> {
  const { user, error } = await authenticateRequest(request)
  if (error || !user) return { response: unauthorized() }

  if (!mongoose.isValidObjectId(projectId)) return { response: badId() }

  await connectToDatabase()

  let query = Project.findById(projectId)
  for (const path of options.populate ?? []) {
    query = query.populate(path, 'name email profilePicture role')
  }
  const project = await query

  if (!project) return { response: notFound('Project') }
  if (!isProjectMember(project, user.userId)) return { response: notFound('Project') }

  if (options.ownerOnly && !isProjectOwner(project, user.userId)) {
    return { response: forbidden() }
  }

  if (options.editorOnly && !(await isProjectEditor(project, user.userId))) {
    return { response: forbidden() }
  }

  return { data: { userId: user.userId, project } }
}

export interface TaskContext {
  userId: string
  task: any
  project: any
}

/**
 * Resolve the caller and a task, asserting membership of the task's project.
 *
 * - `editorOnly` restricts to the project's admin owner or team_leader —
 *   creating, editing and deleting tasks is planning work, not something a
 *   developer does for themselves.
 * - `assigneeOrEditor` is for status changes specifically: an editor can
 *   move any task, but a developer may only move a task assigned to them —
 *   that's their one write action, and it's how they report progress.
 */
export async function authorizeTask(
  request: NextRequest,
  taskId: string,
  options: {
    populate?: string[]
    editorOnly?: boolean
    assigneeOrEditor?: boolean
  } = {}
): Promise<Guard<TaskContext>> {
  const { user, error } = await authenticateRequest(request)
  if (error || !user) return { response: unauthorized() }

  if (!mongoose.isValidObjectId(taskId)) return { response: badId() }

  await connectToDatabase()

  let query = Task.findById(taskId)
  for (const path of options.populate ?? []) {
    query = query.populate(path, 'name email profilePicture')
  }
  const task = await query

  if (!task) return { response: notFound('Task') }

  const project = await Project.findById(task.projectId)
  if (!project) return { response: notFound('Task') }
  if (!isProjectMember(project, user.userId)) return { response: notFound('Task') }

  if (options.editorOnly && !(await isProjectEditor(project, user.userId))) {
    return { response: forbidden() }
  }

  if (options.assigneeOrEditor) {
    const isAssignee = task.assignedTo?.toString() === user.userId
    if (!isAssignee && !(await isProjectEditor(project, user.userId))) {
      return { response: forbidden() }
    }
  }

  return { data: { userId: user.userId, task, project } }
}

/**
 * Gate an admin-only route.
 *
 * Deliberately re-reads the role from the database on every call instead of
 * trusting the role embedded in the JWT. The token can be up to an hour old
 * (longer with a refresh in between) — if an admin is demoted, a cached
 * claim would keep granting admin access for the rest of that window. A DB
 * read here is the only way a demotion takes effect immediately.
 */
export async function authorizeAdmin(
  request: NextRequest
): Promise<Guard<{ userId: string }>> {
  const { user, error } = await authenticateRequest(request)
  if (error || !user) return { response: unauthorized() }

  await connectToDatabase()

  const account = await User.findById(user.userId).select('role status')
  if (!account || account.role !== 'admin' || account.status !== 'active') {
    return { response: forbidden() }
  }

  return { data: { userId: user.userId } }
}

/** Recompute and persist a project's completion percentage. */
export async function syncProjectProgress(projectId: mongoose.Types.ObjectId | string) {
  const [total, completed] = await Promise.all([
    Task.countDocuments({ projectId }),
    Task.countDocuments({ projectId, status: 'complete' }),
  ])

  await Project.findByIdAndUpdate(projectId, {
    progress: total > 0 ? Math.round((completed / total) * 100) : 0,
  })
}
