import type { TaskStatus } from '@/types'

/** User-facing names for the stored status values (the values themselves never change). */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To Do',
  'in-progress': 'In Progress',
  review: 'In Review',
  complete: 'Complete',
}

/**
 * The one definition of how a task may move, shared by the server (which
 * enforces it) and the UI (which only decides which buttons to offer).
 *
 *   To Do → In Progress → In Review → Complete
 *
 * A developer moves their own task up to In Review and may step back to To Do.
 * Only the project owner / team leader can send a task back from review,
 * complete it, or reopen it.
 */
export type Actor = 'leader' | 'developer'

const LEADER_MOVES: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in-progress'],
  'in-progress': ['todo', 'review'],
  review: ['in-progress', 'complete'],
  complete: ['in-progress'],
}

const DEVELOPER_MOVES: Record<TaskStatus, TaskStatus[]> = {
  todo: ['in-progress'],
  'in-progress': ['todo', 'review'],
  review: [],
  complete: [],
}

export function allowedMoves(actor: Actor, from: TaskStatus): TaskStatus[] {
  return (actor === 'leader' ? LEADER_MOVES : DEVELOPER_MOVES)[from]
}

/**
 * - `same`: nothing changes (allowed, e.g. a pure re-order);
 * - `forbidden`: a valid move, but not one this actor may make;
 * - `invalid`: not a legal move for anyone (e.g. To Do → Complete).
 */
export type TransitionCheck = 'ok' | 'same' | 'forbidden' | 'invalid'

export function checkTransition(actor: Actor, from: TaskStatus, to: TaskStatus): TransitionCheck {
  if (from === to) return 'same'
  if (allowedMoves(actor, from).includes(to)) return 'ok'
  return LEADER_MOVES[from].includes(to) ? 'forbidden' : 'invalid'
}

interface Stamped {
  startedAt?: Date | string | null
  completedAt?: Date | string | null
}

/**
 * Server-side timestamps for a status change. `startedAt` marks the current
 * work cycle: it is set when work starts (To Do → In Progress, or a reopen),
 * cleared when the task steps back to To Do, and left alone when a task is
 * sent back from review. `completedAt` is set on completion and cleared on a
 * reopen.
 */
export function statusTimestamps(
  previous: TaskStatus,
  next: TaskStatus,
  _existing: Stamped,
  now: Date = new Date()
): { set: Record<string, Date>; unset: string[] } {
  const set: Record<string, Date> = {}
  const unset: string[] = []

  if (previous === 'todo' && next === 'in-progress') set.startedAt = now
  if (previous === 'complete' && next === 'in-progress') {
    set.startedAt = now
    unset.push('completedAt')
  }
  if (previous === 'in-progress' && next === 'todo') unset.push('startedAt')
  if (previous === 'review' && next === 'complete') set.completedAt = now

  return { set, unset }
}
