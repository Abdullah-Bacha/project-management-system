import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ depFind: vi.fn(), taskFind: vi.fn() }))
vi.mock('@/lib/db/models', () => ({
  TaskDependency: { find: m.depFind },
  Task: { find: m.taskFind },
}))

import { blockerCounts, isUnresolved, withBlockerCounts } from './dependencies'
import { activitySentence } from '@/lib/activity-text'
import type { ActivityItem } from '@/types'

const chain = (value: unknown) => {
  const q: any = {}
  q.select = () => q
  q.lean = () => Promise.resolve(value)
  return q
}

beforeEach(() => vi.resetAllMocks())

describe('blocker counts', () => {
  it('Complete is the only resolved state', () => {
    expect(['todo', 'in-progress', 'review'].every(isUnresolved)).toBe(true)
    expect(isUnresolved('complete')).toBe(false)
  })

  it('counts every blocker and the unresolved ones, in two queries for the whole page', async () => {
    m.depFind.mockReturnValue(
      chain([
        { blockedTaskId: 'b', blockingTaskId: 'x' },
        { blockedTaskId: 'b', blockingTaskId: 'y' },
        { blockedTaskId: 'b', blockingTaskId: 'z' },
        { blockedTaskId: 'c', blockingTaskId: 'x' },
      ])
    )
    m.taskFind.mockReturnValue(
      chain([
        { _id: 'x', status: 'in-progress' },
        { _id: 'y', status: 'complete' },
        { _id: 'z', status: 'review' },
      ])
    )
    const counts = await blockerCounts(['a', 'b', 'c'])
    expect(counts.get('b')).toEqual({ total: 3, open: 2 })
    expect(counts.get('c')).toEqual({ total: 1, open: 1 })
    expect(counts.has('a')).toBe(false)
    expect(m.depFind).toHaveBeenCalledTimes(1)
    expect(m.taskFind).toHaveBeenCalledTimes(1)
  })

  it('a reopened blocker counts again, and the task keeps its own status', async () => {
    m.depFind.mockReturnValue(chain([{ blockedTaskId: 'b', blockingTaskId: 'x' }]))
    m.taskFind.mockReturnValue(chain([{ _id: 'x', status: 'in-progress' }]))
    const [task] = await withBlockerCounts([{ _id: 'b', status: 'in-progress' } as any])
    expect(task).toMatchObject({ status: 'in-progress', blockedByCount: 1, openBlockers: 1 })
  })

  it('an empty page makes no query', async () => {
    expect((await blockerCounts([])).size).toBe(0)
    expect(m.depFind).not.toHaveBeenCalled()
  })
})

describe('feed wording', () => {
  const base = { _id: '1', createdAt: new Date().toISOString(), actor: { _id: 'u', name: 'Abdullah' }, assignee: null }

  it('reads as a sentence about the blocker and the blocked task', () => {
    const item: ActivityItem = {
      ...base,
      type: 'DEPENDENCY_ADDED',
      task: { _id: 'b', title: 'Frontend Integration' },
      relatedTask: { _id: 'a', title: 'API Development' },
    }
    expect(activitySentence(item)).toBe('Abdullah made "API Development" a blocker for "Frontend Integration"')
    expect(activitySentence({ ...item, type: 'DEPENDENCY_REMOVED' })).toBe(
      'Abdullah removed the dependency between "API Development" and "Frontend Integration"'
    )
  })

  it('survives a deleted task', () => {
    const item: ActivityItem = { ...base, type: 'DEPENDENCY_ADDED', task: { _id: 'b', title: 'B' } }
    expect(activitySentence(item)).toBe('Abdullah made "a deleted task" a blocker for "B"')
  })
})
