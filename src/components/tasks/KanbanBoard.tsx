'use client'

import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'
import { Circle, CircleDashed, Eye, CheckCircle2, ArrowRight } from 'lucide-react'
import { Task, TaskStatus } from '@/types'
import { TaskCard } from './TaskCard'
import { TaskDetailPanel } from './TaskDetailPanel'
import { tasksService } from '@/services/tasks.service'

interface KanbanBoardProps {
  projectId: string
  /** Bump this value to force a refetch (e.g. after creating a task). */
  refreshKey?: number
  /** Admin or the project's team leader — can move any task and edit fully. */
  isEditor: boolean
  currentUserId?: string
}

type Column = {
  status: TaskStatus
  label: string
  icon: typeof Circle
  accent: string
  /** The status this column's tasks advance to, and the button's label. */
  next?: { status: TaskStatus; label: string }
}

const columns: Column[] = [
  {
    status: 'todo',
    label: 'To Do',
    icon: CircleDashed,
    accent: 'text-ink-faint',
    next: { status: 'in-progress', label: 'Start' },
  },
  {
    status: 'in-progress',
    label: 'In Progress',
    icon: Circle,
    accent: 'text-brand-500',
    next: { status: 'review', label: 'Review' },
  },
  {
    status: 'review',
    label: 'Review',
    icon: Eye,
    accent: 'text-accent',
    next: { status: 'complete', label: 'Done' },
  },
  {
    status: 'complete',
    label: 'Complete',
    icon: CheckCircle2,
    accent: 'text-positive',
  },
]

export function KanbanBoard({
  projectId,
  refreshKey = 0,
  isEditor,
  currentUserId,
}: KanbanBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    try {
      const data = await tasksService.getByProject(projectId)
      setTasks(data)
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadTasks()
  }, [loadTasks, refreshKey])

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    setMovingId(taskId)
    // Optimistic move so the card slides over immediately.
    setTasks((prev) =>
      prev.map((t) => (t._id === taskId ? { ...t, status: newStatus } : t))
    )
    try {
      await tasksService.updateStatus(taskId, newStatus)
      await loadTasks()
    } catch (error) {
      console.error('Failed to update task status:', error)
      await loadTasks() // roll back to server truth
    } finally {
      setMovingId(null)
    }
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((c) => (
          <div key={c.status} className="space-y-3">
            <div className="skeleton h-9 rounded-xl" />
            <div className="skeleton h-24 rounded-xl" />
            <div className="skeleton h-24 rounded-xl" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <>
      {openTaskId && (
        <TaskDetailPanel
          taskId={openTaskId}
          projectId={projectId}
          onClose={() => setOpenTaskId(null)}
          onChanged={loadTasks}
          isEditor={isEditor}
          currentUserId={currentUserId}
        />
      )}

      <div className="grid h-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column, colIndex) => {
        const columnTasks = tasks.filter((t) => t.status === column.status)
        const Icon = column.icon

        return (
          <section
            key={column.status}
            className="animate-rise flex min-h-0 flex-col rounded-card border border-hairline bg-surface/60"
            style={{ animationDelay: `${colIndex * 0.06}s` }}
          >
            <header className="flex items-center gap-2 border-b border-hairline px-4 py-3">
              <Icon className={clsx('h-4 w-4', column.accent)} />
              <h3 className="text-sm font-semibold text-ink">{column.label}</h3>
              <span className="ml-auto rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-ink-muted tabular-nums">
                {columnTasks.length}
              </span>
            </header>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
              {columnTasks.length === 0 ? (
                <p className="py-10 text-center text-xs text-ink-faint">
                  Nothing here
                </p>
              ) : (
                columnTasks.map((task) => {
                  const assigneeId = task.assignedTo
                    ? (task.assignedTo as any)._id ?? task.assignedTo
                    : null
                  const canAdvance =
                    isEditor || (currentUserId && assigneeId === currentUserId)

                  return (
                  <div
                    key={task._id}
                    className={clsx(
                      'group/task transition-opacity duration-200',
                      movingId === task._id && 'opacity-50'
                    )}
                  >
                    <TaskCard task={task} onClick={() => setOpenTaskId(task._id)} />

                    {column.next && canAdvance && (
                      <button
                        onClick={() =>
                          handleStatusChange(task._id, column.next!.status)
                        }
                        disabled={movingId === task._id}
                        className={clsx(
                          'mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5',
                          'text-xs font-medium text-ink-muted',
                          'opacity-0 transition-all duration-200',
                          'group-hover/task:opacity-100 focus-visible:opacity-100',
                          'hover:bg-brand-50 hover:text-brand-700 disabled:opacity-40'
                        )}
                      >
                        {column.next.label}
                        <ArrowRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  )
                })
              )}
            </div>
            </section>
          )
        })}
      </div>
    </>
  )
}
