import { z } from 'zod'
import { isValidDateOnly } from '@/lib/due-date'
import { TASK_PRIORITIES, TEMPLATE_LIMITS as L } from '@/types'
import { objectIdString } from './index'

const dateOnly = z.string().refine(isValidDateOnly, 'Invalid date')

/** One task blueprint: only what normal task creation supports. Unknown keys (ids, status, assignee…) are dropped. */
export const blueprintSchema = z.object({
  title: z.string().trim().min(L.taskTitle.min).max(L.taskTitle.max),
  description: z.string().max(L.taskDescription).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  dueOffsetDays: z.number().int().min(L.dueOffsetDays.min).max(L.dueOffsetDays.max).optional(),
})

const templateFields = {
  name: z.string().trim().min(L.name.min).max(L.name.max),
  description: z.string().max(L.description).optional(),
  category: z.string().trim().max(L.category).optional(),
  projectDescription: z.string().max(L.projectDescription).optional(),
  requirements: z.string().max(L.requirements).optional(),
  tasks: z.array(blueprintSchema).max(L.tasks).default([]),
}

/** A template written from scratch, or a full replacement of one. */
export const templateSchema = z.object(templateFields)

/**
 * POST /api/templates: either `fromProjectId` (save a project's structure; name
 * and category optional), or a template written out in full.
 */
export const createTemplateSchema = z.union([
  z.object({ fromProjectId: objectIdString, name: templateFields.name.optional(), category: templateFields.category }),
  templateSchema,
])

export const useTemplateSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().max(500).optional(),
    requirements: z.string().max(L.requirements).optional(),
    startDate: dateOnly.optional(),
    deadline: dateOnly.optional(),
    teamId: objectIdString.optional(),
    today: dateOnly.optional(),
    requestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, 'Invalid request id'),
  })
  .refine((v) => !v.startDate || !v.deadline || v.deadline >= v.startDate, {
    message: 'Deadline cannot be before the start date',
    path: ['deadline'],
  })
