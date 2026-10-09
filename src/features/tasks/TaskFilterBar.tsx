'use client'

import clsx from 'clsx'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { TASK_STATUS_LABELS } from '@/lib/task-status'
import { DUE_FILTERS, DUE_FILTER_LABELS, type DueFilter } from '@/lib/due-date'
import {
  TASK_SEARCH_MAX,
  applyQuickFilter,
  cleanFilters,
  hasActiveFilters,
  quickFilterOf,
  type QuickFilter,
  type TaskFilters,
} from '@/lib/task-filters'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus, type UserSummary } from '@/types'

const STATUS_NAMES: Record<TaskStatus, string> = { ...TASK_STATUS_LABELS, complete: 'Completed' }

interface TaskFilterBarProps {
  filters: TaskFilters
  onChange: (next: TaskFilters) => void
  /** The signed-in user, for the "My Tasks" shortcut. */
  meId?: string
  /** Show the Developer filter and "My Tasks" (project owners and team leaders). */
  developers?: UserSummary[]
  /** Show the Created By filter. */
  creators?: UserSummary[]
  /** Show the Project filter (the cross-project My Tasks list). */
  projects?: { _id: string; title: string }[]
}

/** Search box, filters and one-click shortcuts. Purely controlled: the parent decides what to fetch. */
export function TaskFilterBar({ filters, onChange, meId, developers, creators, projects }: TaskFilterBarProps) {
  const set = (patch: Partial<TaskFilters>) => onChange({ ...filters, ...patch })
  const active = cleanFilters(filters)
  const quick = quickFilterOf(filters, meId)

  const shortcuts: { id: QuickFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...(developers ? [{ id: 'mine' as const, label: 'My Tasks' }] : []),
    ...TASK_STATUSES.map((s) => ({ id: s, label: STATUS_NAMES[s] })),
  ]

  const nameOf = (list: { _id: string; name?: string; title?: string }[] | undefined, id?: string) => {
    const found = list?.find((x) => x._id === id)
    return found?.name ?? found?.title ?? 'Unknown'
  }

  const chips: { key: keyof TaskFilters; text: string }[] = [
    ...(active.q ? [{ key: 'q' as const, text: `Search: ${active.q}` }] : []),
    ...(active.status ? [{ key: 'status' as const, text: `Status: ${STATUS_NAMES[active.status]}` }] : []),
    ...(active.priority ? [{ key: 'priority' as const, text: `Priority: ${active.priority.charAt(0).toUpperCase()}${active.priority.slice(1)}` }] : []),
    ...(active.due ? [{ key: 'due' as const, text: `Due: ${DUE_FILTER_LABELS[active.due]}` }] : []),
    ...(active.assigneeId ? [{ key: 'assigneeId' as const, text: active.assigneeId === meId ? 'Assigned to me' : `Developer: ${nameOf(developers, active.assigneeId)}` }] : []),
    ...(active.createdBy ? [{ key: 'createdBy' as const, text: `Created by: ${nameOf(creators, active.createdBy)}` }] : []),
    ...(active.projectId ? [{ key: 'projectId' as const, text: `Project: ${nameOf(projects, active.projectId)}` }] : []),
  ]

  const selectCount = 3 + (developers ? 1 : 0) + (creators ? 1 : 0) + (projects ? 1 : 0)

  return (
    <section aria-label="Search and filter tasks" className="space-y-3 rounded-card border border-hairline bg-surface p-4 shadow-card">
      <Input
        type="search"
        aria-label="Search tasks"
        placeholder="Search tasks by title or description…"
        icon={<Search className="h-4 w-4" />}
        value={filters.q ?? ''}
        maxLength={TASK_SEARCH_MAX}
        onChange={(e) => set({ q: e.target.value })}
      />

      <div className={clsx('grid grid-cols-1 gap-3 sm:grid-cols-2', selectCount >= 3 && 'lg:grid-cols-3',
          selectCount >= 5 && 'xl:grid-cols-5')}>
        <Select
          label="Status"
          value={filters.status ?? ''}
          onChange={(e) => set({ status: (e.target.value || undefined) as TaskStatus | undefined })}
        >
          <option value="">All statuses</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_NAMES[s]}
            </option>
          ))}
        </Select>

        <Select
          label="Priority"
          value={filters.priority ?? ''}
          className="capitalize"
          onChange={(e) => set({ priority: (e.target.value || undefined) as TaskPriority | undefined })}
        >
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>

        <Select
          label="Due date"
          value={filters.due ?? ''}
          onChange={(e) => set({ due: (e.target.value || undefined) as DueFilter | undefined })}
        >
          <option value="">All due dates</option>
          {DUE_FILTERS.map((d) => (
            <option key={d} value={d}>
              {DUE_FILTER_LABELS[d]}
            </option>
          ))}
        </Select>

        {developers && (
          <Select label="Developer" value={filters.assigneeId ?? ''} onChange={(e) => set({ assigneeId: e.target.value || undefined })}>
            <option value="">All developers</option>
            {developers.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}

        {creators && (
          <Select label="Created by" value={filters.createdBy ?? ''} onChange={(e) => set({ createdBy: e.target.value || undefined })}>
            <option value="">Everyone</option>
            {creators.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        )}

        {projects && (
          <Select label="Project" value={filters.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || undefined })}>
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p._id} value={p._id}>
                {p.title}
              </option>
            ))}
          </Select>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick filters">
        {shortcuts.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={quick === id}
            onClick={() => onChange(applyQuickFilter(filters, id, meId))}
            className={clsx(
              'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              quick === id ? 'bg-interactive text-on-brand' : 'bg-surface-sunken text-ink-muted hover:bg-hairline'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {hasActiveFilters(filters) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700"
            >
              <span className="truncate">{chip.text}</span>
              <button
                type="button"
                aria-label={`Remove ${chip.text}`}
                onClick={() => set({ [chip.key]: undefined })}
                className="shrink-0 rounded-full hover:bg-brand-100"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" onClick={() => onChange({})} className="text-xs font-medium text-interactive hover:text-interactive-hover">
            Clear filters
          </button>
        </div>
      )}
    </section>
  )
}
