'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { Circle, CircleDashed, Eye, CheckCircle2 } from 'lucide-react'
import { tasksService } from '@/services/tasks.service'
import { TaskActions } from './TaskActions'
import { TaskCard } from './TaskCard'
import { TaskDetailPanel } from './TaskDetailPanel'
import type { Task, TaskStatus, UserSummary } from '@/types'

interface KanbanBoardProps {
  tasks: Task[]
  /** Merge a changed task into the list / drop a deleted one (from useProjectTasks). */
  onTaskChanged: (task: Task) => void
  onTaskRemoved: (taskId: string) => void
  /** Re-read the list; used to roll back a move the server rejected. */
  onReload: () => void
  /** Owner or team leader — can move any task and edit fully. */
  canEdit: boolean
  currentUserId?: string
  /** The project's members, for the task panel's assignee picker. */
  members: UserSummary[]
  /** Open this task's panel on first render (deep link from My Tasks). */
  initialOpenTaskId?: string | null
}

type Column = {
  status: TaskStatus
  label: string
  icon: typeof Circle
  accent: string
}

const columns: Column[] = [
  {
    status: 'todo',
    label: 'To Do',
    icon: CircleDashed,
    accent: 'text-ink-faint',
  },
  {
    status: 'in-progress',
    label: 'In Progress',
    icon: Circle,
    accent: 'text-brand-500',
  },
  {
    status: 'review',
    label: 'In Review',
    icon: Eye,
    accent: 'text-accent',
  },
  {
    status: 'complete',
    label: 'Complete',
    icon: CheckCircle2,
    accent: 'text-positive',
  },
]

export function KanbanBoard({
  tasks,
  onTaskChanged,
  onTaskRemoved,
  onReload,
  canEdit,
  currentUserId,
  members,
  initialOpenTaskId = null,
}: KanbanBoardProps) {
  const [movingId, setMovingId] = useState<string | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(initialOpenTaskId)

  const handleStatusChange = async (task: Task, newStatus: TaskStatus) => {
    setMovingId(task._id)
    // Optimistic move so the card slides over immediately...
    onTaskChanged({ ...task, status: newStatus })
    try {
      // ...then keep the server's version of the task (no board reload).
      onTaskChanged(await tasksService.updateStatus(task._id, newStatus))
    } catch (error) {
      console.error('Failed to update task status:', error)
      onReload() // roll back to server truth
    } finally {
      setMovingId(null)
    }
  }

  return (
    <>
      {openTaskId && (
        <TaskDetailPanel
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onSaved={onTaskChanged}
          onDeleted={onTaskRemoved}
          canEdit={canEdit}
          currentUserId={currentUserId}
          members={members}
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
                  <p className="py-10 text-center text-xs text-ink-faint">Nothing here</p>
                ) : (
                  columnTasks.map((task) => {
                    // A developer may only move a task assigned to them.
                    const canAdvance = canEdit || task.assignedTo?._id === currentUserId

                    return (
                      <div
                        key={task._id}
                        className={clsx(
                          'group/task transition-opacity duration-200',
                          movingId === task._id && 'opacity-50'
                        )}
                      >
                        <TaskCard task={task} onClick={() => setOpenTaskId(task._id)} />

                        {canAdvance && (
                          <TaskActions
                            task={task}
                            actor={canEdit ? 'leader' : 'developer'}
                            busy={movingId === task._id}
                            onMove={(status) => handleStatusChange(task, status)}
                            className="mt-1.5 px-1"
                          />
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
