'use client'

import { ListChecks } from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { Modal } from '@/components/ui/Modal'
import { MyTasksList } from '@/features/tasks/MyTasksList'
import { useMyTasks } from '@/features/tasks/useMyTasks'
import { useTaskStatusUpdate } from '@/features/tasks/useTaskStatusUpdate'
import { deadlineState, localToday } from '@/lib/due-date'
import type { MyTask } from '@/types'

/** The developer's stat cards, each one a view of the same assigned tasks. */
export type TaskStat = 'open' | 'in-progress' | 'review' | 'complete' | 'overdue'

const VIEWS: Record<TaskStat, { title: string; empty: string; keep: (t: MyTask, today: string) => boolean }> = {
  open: { title: 'My tasks', empty: 'Nothing is open and assigned to you.', keep: (t) => t.status !== 'complete' },
  'in-progress': { title: 'In progress', empty: 'You are not working on any task right now.', keep: (t) => t.status === 'in-progress' },
  review: { title: 'Waiting for review', empty: 'None of your tasks is waiting for your team leader.', keep: (t) => t.status === 'review' },
  complete: { title: 'Completed', empty: 'No task of yours has been approved yet.', keep: (t) => t.status === 'complete' },
  overdue: { title: 'Overdue', empty: 'Nothing is overdue.', keep: (t, today) => deadlineState(t.dueDate, t.status, today) === 'OVERDUE' },
}

/** The tasks behind one stat card, with the same workflow buttons as the main list. Fetched only while open. */
export function TaskStatDrawer({ stat, onClose }: { stat: TaskStat; onClose: () => void }) {
  const mine = useMyTasks(50, true) // finished tasks included, so "Completed" has something to show
  const { changeStatus, busyId, toastNode } = useTaskStatusUpdate(mine.refetch)
  const { title, empty, keep } = VIEWS[stat]
  const today = localToday()
  const tasks = mine.tasks.filter((t) => keep(t, today))

  return (
    <Modal title={title} placement="right" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mine.isLoading && mine.tasks.length === 0 ? (
          <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading tasks">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 rounded-lg" />
            ))}
          </div>
        ) : mine.error && mine.tasks.length === 0 ? (
          <ErrorState compact message={mine.error} status={mine.errorStatus} onRetry={mine.refetch} />
        ) : tasks.length === 0 ? (
          <div className="p-5">
            <EmptyState compact icon={<ListChecks className="h-6 w-6" />} title="No tasks here">
              {empty}
            </EmptyState>
          </div>
        ) : (
          <>
            <p className="border-b border-hairline px-5 py-2.5 text-xs font-medium text-ink-muted">
              {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
            </p>
            <MyTasksList tasks={tasks} onStatusChange={changeStatus} busyId={busyId} groupByProject stacked />
          </>
        )}
      </div>
      {toastNode}
    </Modal>
  )
}
