'use client'

import { useState } from 'react'
import { ListChecks, SearchX } from 'lucide-react'
import { RealtimeStatus } from '@/components/ui/RealtimeStatus'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useRealtimeProjects } from '@/features/projects/useRealtimeProjects'
import { MyTasksList } from '@/features/tasks/MyTasksList'
import { TaskFilterBar } from '@/features/tasks/TaskFilterBar'
import { useMyTasks } from '@/features/tasks/useMyTasks'
import { useTaskStatusUpdate } from '@/features/tasks/useTaskStatusUpdate'
import { cleanFilters, hasActiveFilters, type TaskFilters } from '@/lib/task-filters'

const LIMIT = 50

export default function MyTasksPage() {
  // The text is sent to the server after a short pause, not on every keystroke.
  const [filters, setFilters] = useState<TaskFilters>({})
  const debouncedText = useDebouncedValue(filters.q ?? '', 400)
  const effective = cleanFilters({ ...filters, q: debouncedText })
  const filtering = hasActiveFilters(effective)

  const { tasks, total, overdue, isLoading, error, errorStatus, refetch, lastUpdated, isLive } = useMyTasks(
    LIMIT,
    true,
    effective
  )
  const { projects } = useRealtimeProjects()
  const { changeStatus, busyId, toastNode } = useTaskStatusUpdate(refetch)

  return (
    <div className="space-y-6">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">My tasks</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {filtering
              ? `${tasks.length}${tasks.length >= LIMIT ? '+' : ''} ${tasks.length === 1 ? 'task' : 'tasks'} found`
              : total > 0
                ? `${total} open task${total === 1 ? '' : 's'} assigned to you${overdue > 0 ? `, ${overdue} overdue` : ''}. Start a task, submit it for review, and your team leader completes it.`
                : 'Tasks assigned to you across your projects.'}
          </p>
        </div>
        <RealtimeStatus lastUpdated={lastUpdated} isLoading={isLoading} isConnected={isLive} />
      </header>

      <TaskFilterBar filters={filters} onChange={setFilters} projects={projects} />

      <section className="rounded-card border border-hairline bg-surface shadow-card">
        {isLoading && tasks.length === 0 ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading tasks">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton h-12 rounded-lg" />
            ))}
          </div>
        ) : error && tasks.length === 0 ? (
          <ErrorState compact message="Unable to load tasks." status={errorStatus} onRetry={refetch} />
        ) : tasks.length === 0 ? (
          filtering ? (
            <EmptyState
              compact
              icon={<SearchX className="h-6 w-6" />}
              title="No tasks found"
              action={
                <Button variant="secondary" size="sm" onClick={() => setFilters({})}>
                  Clear filters
                </Button>
              }
            >
              No tasks match your current filters.
            </EmptyState>
          ) : (
            <EmptyState compact icon={<ListChecks className="h-6 w-6" />} title="Nothing assigned to you">
              Tasks your team leader assigns to you will show up here.
            </EmptyState>
          )
        ) : (
          <MyTasksList tasks={tasks} onStatusChange={changeStatus} busyId={busyId} groupByProject />
        )}
      </section>
      {tasks.length >= LIMIT && <p className="text-center text-xs text-ink-muted">Showing your 50 most urgent tasks.</p>}
      {toastNode}
    </div>
  )
}
