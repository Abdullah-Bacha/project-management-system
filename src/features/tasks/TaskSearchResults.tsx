'use client'

import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { DueDate } from '@/components/ui/DueDate'
import { PriorityBadge, TaskStatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { Button } from '@/components/ui/Button'
import { useTaskSearch } from './useTaskSearch'
import type { TaskFilters } from '@/lib/task-filters'

interface TaskSearchResultsProps {
  projectId: string
  filters: TaskFilters
  /** Owners and team leaders see who each task belongs to and open it in that developer's workspace. */
  isEditor: boolean
  onClear: () => void
}

/** The tasks matching the current search / filters. Mounted only while a filter is active. */
export function TaskSearchResults({ projectId, filters, isEditor, onClear }: TaskSearchResultsProps) {
  const { tasks, isLoading, error, errorStatus, refetch } = useTaskSearch(projectId, filters)

  if (!tasks) {
    return isLoading ? (
      <div className="space-y-2" aria-busy="true" aria-label="Searching tasks">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-16 rounded-card" />
        ))}
      </div>
    ) : (
      <ErrorState compact status={errorStatus} message={error ?? 'Unable to load tasks.'} onRetry={refetch} />
    )
  }

  if (tasks.length === 0) {
    return (
      <EmptyState
        compact
        icon={<SearchX className="h-6 w-6" />}
        title="No tasks found"
        action={
          <Button variant="secondary" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        }
      >
        No tasks match your current filters.
      </EmptyState>
    )
  }

  return (
    <div>
      <p className="mb-2 text-sm text-ink-muted" aria-live="polite">
        {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} found
      </p>
      <ul className="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {tasks.map((task) => (
          <li key={task._id}>
            <Link
              href={`/dashboard/projects/${projectId}?${isEditor ? `developer=${task.assignedTo?._id ?? 'unassigned'}&` : ''}task=${task._id}`}
              className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-surface-sunken sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{task.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
                  {isEditor && <span>{task.assignedTo?.name ?? 'Unassigned'}</span>}
                  <DueDate dueDate={task.dueDate} status={task.status} />
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <PriorityBadge priority={task.priority} />
                <TaskStatusBadge status={task.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
