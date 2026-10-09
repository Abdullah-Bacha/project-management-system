import { describe, it, expect } from 'vitest'
import { blueprintsFromTasks, dueDateFor, offsetBaseDay } from './templates'
import { createTemplateSchema, templateSchema, useTemplateSchema } from './validation/templates'
import { TEMPLATE_LIMITS } from '@/types'

describe('due-date rule: base day + offset days, stored as a plain UTC day', () => {
  it('offset 0 is the base day itself; offsets count calendar days', () => {
    expect(dueDateFor('2026-10-09', 0)?.toISOString()).toBe('2026-10-09T00:00:00.000Z')
    expect(dueDateFor('2026-10-09', 7)?.toISOString()).toBe('2026-10-16T00:00:00.000Z')
  })
  it('crosses month ends, year ends and leap days', () => {
    expect(dueDateFor('2026-10-30', 3)?.toISOString()).toBe('2026-11-02T00:00:00.000Z')
    expect(dueDateFor('2026-12-30', 5)?.toISOString()).toBe('2027-01-04T00:00:00.000Z')
    expect(dueDateFor('2028-02-27', 2)?.toISOString()).toBe('2028-02-29T00:00:00.000Z')
  })
  it('no offset means no due date; nonsense gives none rather than a wrong date', () => {
    expect(dueDateFor('2026-10-09')).toBeUndefined()
    expect(dueDateFor('2026-10-09', null)).toBeUndefined()
    expect(dueDateFor('2026-10-09', -1)).toBeUndefined()
    expect(dueDateFor('2026-10-09', 1.5)).toBeUndefined()
    expect(dueDateFor('2026-02-30', 1)).toBeUndefined()
  })
  it('counts from the start date when there is one, else the viewer\'s today, else the server date', () => {
    expect(offsetBaseDay({ startDate: '2026-11-01', today: '2026-10-09' }, '2026-10-08')).toBe('2026-11-01')
    expect(offsetBaseDay({ today: '2026-10-09' }, '2026-10-08')).toBe('2026-10-09')
    expect(offsetBaseDay({}, '2026-10-08')).toBe('2026-10-08')
    expect(offsetBaseDay({ startDate: 'garbage', today: 'nope' }, '2026-10-08')).toBe('2026-10-08')
  })
})

describe('blueprintsFromTasks: structure only', () => {
  const tasks = [
    {
      _id: 'task-1',
      title: 'Design the home page',
      description: 'Wireframes first',
      priority: 'high',
      status: 'complete',
      assignedTo: 'user-1',
      projectId: 'proj-1',
      completedAt: new Date(),
      startedAt: new Date(),
      dueDate: new Date('2026-10-16T00:00:00Z'),
    },
    { title: 'Write copy', priority: 'weird', dueDate: new Date('2026-09-01T00:00:00Z') },
    { title: 'x' },
    { title: '   ' },
  ]
  const { blueprints } = blueprintsFromTasks(tasks as any, '2026-10-09')

  it('keeps title, description, priority and a safe offset only', () => {
    expect(blueprints).toEqual([
      { title: 'Design the home page', description: 'Wireframes first', priority: 'high', dueOffsetDays: 7 },
      { title: 'Write copy', priority: 'medium' }, // unknown priority → medium; due date before the base → no offset
    ])
  })
  it('copies no status, assignee, id, timestamp or absolute date', () => {
    const text = JSON.stringify(blueprints)
    for (const leak of ['task-1', 'user-1', 'proj-1', 'complete', 'completedAt', 'startedAt', 'assignedTo', '2026-10-16']) {
      expect(text).not.toContain(leak)
    }
  })
  it('skips titles that could not be created as real tasks', () => {
    expect(blueprints.map((b) => b.title)).not.toContain('x')
  })
  it('stops at the per-template limit and says so', () => {
    const many = Array.from({ length: TEMPLATE_LIMITS.tasks + 5 }, (_, i) => ({ title: `Task number ${i}` }))
    const r = blueprintsFromTasks(many, '2026-10-09')
    expect(r.blueprints).toHaveLength(TEMPLATE_LIMITS.tasks)
    expect(r.truncated).toBe(true)
    expect(blueprintsFromTasks(many.slice(0, 3), '2026-10-09').truncated).toBe(false)
  })
  it('an offset beyond the allowed span is left out, not clamped', () => {
    const far = blueprintsFromTasks([{ title: 'Far away', dueDate: new Date('2030-01-01T00:00:00Z') }] as any, '2026-10-09')
    expect(far.blueprints[0].dueOffsetDays).toBeUndefined()
  })
})

describe('template validation', () => {
  const valid = { name: 'Website launch', tasks: [{ title: 'Plan the launch', priority: 'high', dueOffsetDays: 3 }] }

  it('accepts a valid template, and a template with no tasks', () => {
    expect(templateSchema.safeParse(valid).success).toBe(true)
    expect(templateSchema.parse({ name: 'Empty one' }).tasks).toEqual([])
  })
  it.each([
    ['empty name', { ...valid, name: '' }],
    ['blank name', { ...valid, name: '   ' }],
    ['short name', { ...valid, name: 'ab' }],
    ['long name', { ...valid, name: 'a'.repeat(TEMPLATE_LIMITS.name.max + 1) }],
    ['bad priority', { ...valid, tasks: [{ title: 'Plan the launch', priority: 'critical' }] }],
    ['short task title', { ...valid, tasks: [{ title: 'ab' }] }],
    ['negative offset', { ...valid, tasks: [{ title: 'Plan the launch', dueOffsetDays: -1 }] }],
    ['fractional offset', { ...valid, tasks: [{ title: 'Plan the launch', dueOffsetDays: 1.5 }] }],
    ['huge offset', { ...valid, tasks: [{ title: 'Plan the launch', dueOffsetDays: 10_000 }] }],
    ['too many tasks', { ...valid, tasks: Array.from({ length: TEMPLATE_LIMITS.tasks + 1 }, () => ({ title: 'Plan the launch' })) }],
    ['operator as name', { ...valid, name: { $ne: '' } }],
    ['operator as title', { ...valid, tasks: [{ title: { $gt: '' } }] }],
  ])('rejects %s', (_label, body) => {
    expect(templateSchema.safeParse(body).success).toBe(false)
  })
  it('allows exactly the maximum number of tasks', () => {
    const max = { ...valid, tasks: Array.from({ length: TEMPLATE_LIMITS.tasks }, () => ({ title: 'Plan the launch' })) }
    expect(templateSchema.safeParse(max).success).toBe(true)
  })
  it('drops fields a client must not set (owner, status, assignee, ids)', () => {
    const parsed = templateSchema.parse({
      ...valid,
      createdBy: 'someone',
      _id: 'x',
      tasks: [{ title: 'Plan the launch', status: 'complete', assignedTo: 'u1', projectId: 'p1', _id: 't1' }],
    }) as any
    expect(parsed.createdBy).toBeUndefined()
    expect(parsed._id).toBeUndefined()
    expect(parsed.tasks[0]).toEqual({ title: 'Plan the launch' })
  })
  it('create accepts a project id to save from, but only a real id', () => {
    expect(createTemplateSchema.safeParse({ fromProjectId: 'a'.repeat(24) }).success).toBe(true)
    expect(createTemplateSchema.safeParse({ fromProjectId: { $ne: null } }).success).toBe(false)
    expect(createTemplateSchema.safeParse({ fromProjectId: 'short' }).success).toBe(false)
  })
})

describe('use-template validation', () => {
  const ok = { title: 'New site', requestId: 'req-12345678' }
  it('accepts the minimum and a full request', () => {
    expect(useTemplateSchema.safeParse(ok).success).toBe(true)
    expect(useTemplateSchema.safeParse({ ...ok, startDate: '2026-10-01', deadline: '2026-12-01', teamId: 'a'.repeat(24), today: '2026-10-09' }).success).toBe(true)
  })
  it.each([
    ['short title', { ...ok, title: 'ab' }],
    ['no request id', { title: 'New site' }],
    ['bad request id', { ...ok, requestId: '../../x' }],
    ['impossible date', { ...ok, startDate: '2026-02-30' }],
    ['deadline before start', { ...ok, startDate: '2026-10-10', deadline: '2026-10-01' }],
    ['bad team id', { ...ok, teamId: { $ne: null } }],
  ])('rejects %s', (_l, body) => {
    expect(useTemplateSchema.safeParse(body).success).toBe(false)
  })
})
