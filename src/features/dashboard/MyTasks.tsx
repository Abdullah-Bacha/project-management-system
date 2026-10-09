'use client'

import { ListChecks } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { MyTasksList } from '@/features/tasks/MyTasksList'
import type { useMyTasks } from '@/features/tasks/useMyTasks'
import { useTaskStatusUpdate } from '@/features/tasks/useTaskStatusUpdate'
import { Panel } from './Panel'

type Mine = ReturnType<typeof useMyTasks>

/** The developer's open tasks, most urgent first, with the buttons to move them along. */
export function MyTasks({ mine, grouped, className }: { mine: Mine; grouped?: boolean; className?: string }) {
  const { tasks, total, overdue, isLoading, error, errorStatus, refetch } = mine
  const { changeStatus, busyId, toastNode } = useTaskStatusUpdate(refetch)

  return (
    <Panel
      title="My tasks (assigned to you)"
      className={className}
      action={total > 0 ? { href: '/dashboard/tasks', label: total > tasks.length ? `View all ${total}` : 'View all' } : undefined}
    >
      {isLoading && tasks.length === 0 ? (
        <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading tasks">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-10 rounded-lg" />
          ))}
        </div>
      ) : error && tasks.length === 0 ? (
        <ErrorState compact message={error} status={errorStatus} onRetry={refetch} />
      ) : tasks.length === 0 ? (
        <EmptyState compact icon={<ListChecks className="h-6 w-6" />} title="Nothing assigned to you">
          When your team leader gives you a task, it shows up here.
        </EmptyState>
      ) : (
        <>
          {overdue > 0 && (
            <p className="border-b border-hairline bg-critical-subtle px-5 py-2 text-xs font-medium text-critical-strong">
              {overdue} overdue
            </p>
          )}
          <MyTasksList tasks={tasks} onStatusChange={changeStatus} busyId={busyId} groupByProject={grouped} />
        </>
      )}
      {toastNode}
    </Panel>
  )
}
