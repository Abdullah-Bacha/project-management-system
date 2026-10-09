import { Task, TaskDependency } from '@/lib/db/models'
import type { DependencyEntry, DependencyTask, TaskDependencies } from '@/types'

export const DEPENDENCY_ERRORS = {
  self: 'A task cannot depend on itself.',
  notInProject: 'Dependencies must be between tasks in the same project.',
  duplicate: 'This dependency already exists.',
  cycle: 'This dependency would create a circular dependency.',
} as const

const idOf = (value: any): string => String(value?._id ?? value)

/** A blocker is unresolved until it is Complete. */
export const isUnresolved = (status: string) => status !== 'complete'

/**
 * Would "blockingId blocks blockedId" close a loop? It would exactly when
 * blockedId already (directly or through other tasks) blocks blockingId, so
 * walk forward from blockedId along "blocks" edges and see if blockingId turns
 * up. Level by level, one query per level, with a visited set, so a long chain
 * costs its depth in queries and existing data can never loop the walk.
 */
export async function wouldCreateCycle(projectId: unknown, blockingId: string, blockedId: string): Promise<boolean> {
  if (blockingId === blockedId) return true
  const visited = new Set<string>([blockedId])
  let frontier = [blockedId]

  while (frontier.length > 0) {
    const edges: { blockedTaskId: unknown }[] = await TaskDependency.find({
      projectId,
      blockingTaskId: { $in: frontier },
    })
      .select('blockedTaskId')
      .lean()

    const next: string[] = []
    for (const edge of edges) {
      const id = idOf(edge.blockedTaskId)
      if (id === blockingId) return true
      if (!visited.has(id)) {
        visited.add(id)
        next.push(id)
      }
    }
    frontier = next
  }
  return false
}

export type AddResult =
  | { ok: true; dependency: any; blocking: { _id: unknown; title: string } }
  | { ok: false; error: string }

/**
 * Make `blockingTaskId` a blocker of `task`. Every rule is checked here, on the
 * server, in this order: same task, same project, already there, loop. The
 * unique index is what finally settles two simultaneous identical requests.
 */
export async function addDependency(params: {
  task: { _id: unknown; projectId: unknown }
  blockingTaskId: string
  userId: string
}): Promise<AddResult> {
  const { task, blockingTaskId, userId } = params
  const blockedId = idOf(task._id)

  if (blockingTaskId === blockedId) return { ok: false, error: DEPENDENCY_ERRORS.self }

  // A task that does not exist and one in another project are answered alike,
  // so ids from other projects cannot be probed.
  const blocking: { _id: unknown; title: string } | null = await Task.findOne({ _id: blockingTaskId, projectId: task.projectId })
    .select('title')
    .lean()
  if (!blocking) return { ok: false, error: DEPENDENCY_ERRORS.notInProject }

  const existing = await TaskDependency.exists({ blockingTaskId, blockedTaskId: blockedId })
  if (existing) return { ok: false, error: DEPENDENCY_ERRORS.duplicate }

  if (await wouldCreateCycle(task.projectId, blockingTaskId, blockedId)) return { ok: false, error: DEPENDENCY_ERRORS.cycle }

  try {
    const dependency = await TaskDependency.create({
      projectId: task.projectId,
      blockingTaskId,
      blockedTaskId: blockedId,
      createdBy: userId,
    })
    return { ok: true, dependency, blocking }
  } catch (error: any) {
    if (error?.code === 11000) return { ok: false, error: DEPENDENCY_ERRORS.duplicate }
    throw error
  }
}

const SUMMARY_FIELDS = 'title status priority dueDate assignedTo'

function summarize(task: any): DependencyTask {
  return {
    _id: idOf(task._id),
    title: task.title,
    status: task.status,
    priority: task.priority,
    ...(task.dueDate && { dueDate: new Date(task.dueDate).toISOString() }),
    assignee: task.assignedTo?._id ? { _id: idOf(task.assignedTo), name: task.assignedTo.name } : null,
  }
}

/**
 * Both sides of a task's relationships: two small queries however many there
 * are (the relationships, then every related task's summary in one go).
 */
export async function listDependencies(taskId: string): Promise<TaskDependencies> {
  const rows: { _id: unknown; blockingTaskId: unknown; blockedTaskId: unknown }[] = await TaskDependency.find({
    $or: [{ blockedTaskId: taskId }, { blockingTaskId: taskId }],
  })
    .sort({ createdAt: 1 })
    .lean()

  const relatedIds = rows.map((r) => (idOf(r.blockedTaskId) === taskId ? idOf(r.blockingTaskId) : idOf(r.blockedTaskId)))
  const related: any[] = relatedIds.length
    ? await Task.find({ _id: { $in: relatedIds } })
        .select(SUMMARY_FIELDS)
        .populate('assignedTo', 'name')
        .lean()
    : []
  const byId = new Map(related.map((t) => [idOf(t._id), t]))

  const blockedBy: DependencyEntry[] = []
  const blocks: DependencyEntry[] = []
  for (const row of rows) {
    const isBlockedSide = idOf(row.blockedTaskId) === taskId
    const other = byId.get(isBlockedSide ? idOf(row.blockingTaskId) : idOf(row.blockedTaskId))
    if (!other) continue
    ;(isBlockedSide ? blockedBy : blocks).push({ _id: idOf(row._id), task: summarize(other) })
  }

  return { blockedBy, blocks, unresolved: blockedBy.filter((e) => isUnresolved(e.task.status)).length }
}

/** Blocker counts for a page of tasks: two queries for the whole page. */
export async function blockerCounts(taskIds: unknown[]): Promise<Map<string, { total: number; open: number }>> {
  const counts = new Map<string, { total: number; open: number }>()
  if (taskIds.length === 0) return counts

  const rows: { blockingTaskId: unknown; blockedTaskId: unknown }[] = await TaskDependency.find({ blockedTaskId: { $in: taskIds } })
    .select('blockingTaskId blockedTaskId')
    .lean()
  if (rows.length === 0) return counts

  const blockers: { _id: unknown; status: string }[] = await Task.find({ _id: { $in: rows.map((r) => r.blockingTaskId) } })
    .select('status')
    .lean()
  const status = new Map(blockers.map((b) => [idOf(b._id), b.status]))

  for (const row of rows) {
    const blockerStatus = status.get(idOf(row.blockingTaskId))
    if (!blockerStatus) continue
    const entry = counts.get(idOf(row.blockedTaskId)) ?? { total: 0, open: 0 }
    entry.total += 1
    if (isUnresolved(blockerStatus)) entry.open += 1
    counts.set(idOf(row.blockedTaskId), entry)
  }
  return counts
}

/** Attach `blockedByCount` / `openBlockers` to tasks (plain objects out). */
export async function withBlockerCounts<T extends { _id: unknown; toObject?: () => any }>(tasks: T[]) {
  const counts = await blockerCounts(tasks.map((t) => t._id))
  return tasks.map((t) => {
    const plain = typeof t.toObject === 'function' ? t.toObject() : { ...t }
    const c = counts.get(idOf(t._id))
    return { ...plain, blockedByCount: c?.total ?? 0, openBlockers: c?.open ?? 0 }
  })
}

/** Remove one relationship, but only if it belongs to this task (and so this project). */
export async function removeDependency(taskId: string, dependencyId: string) {
  return TaskDependency.findOneAndDelete({
    _id: dependencyId,
    $or: [{ blockedTaskId: taskId }, { blockingTaskId: taskId }],
  }).lean() as Promise<{ blockingTaskId: unknown; blockedTaskId: unknown; projectId: unknown } | null>
}

/** Cascade helpers: a deleted task or project leaves no relationship behind. */
export const deleteTaskDependencies = (taskId: string) =>
  TaskDependency.deleteMany({ $or: [{ blockedTaskId: taskId }, { blockingTaskId: taskId }] })

export const deleteProjectDependencies = (projectId: string) => TaskDependency.deleteMany({ projectId })
