'use client'

import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { TaskActions } from './TaskActions'
import type { Task, TaskStatus } from '@/types'

interface ReviewQueueProps {
  projectId: string
  /** Only the tasks currently In Review. */
  tasks: Task[]
  busyId: string | null
  onMove: (task: Task, status: TaskStatus) => void
}

/** What needs the team leader's decision right now: Complete it, or Send it back. */
export function ReviewQueue({ projectId, tasks, busyId, onMove }: ReviewQueueProps) {
  if (tasks.length === 0) return null

  return (
    <section
      aria-label="Waiting for your review"
      className="animate-rise mb-5 overflow-hidden rounded-card border border-accent/30 bg-accent-subtle/40"
    >
      <h2 className="flex items-center gap-2 border-b border-accent/20 px-5 py-3 text-sm font-semibold text-accent-strong">
        <ClipboardCheck className="h-4 w-4" />
        {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} waiting for your review
      </h2>
      <ul className="divide-y divide-accent/15">
        {tasks.map((task) => (
          <li key={task._id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <Link
                href={`/dashboard/projects/${projectId}?developer=${task.assignedTo?._id ?? 'unassigned'}&task=${task._id}`}
                className="block truncate text-sm font-medium text-ink hover:text-interactive"
              >
                {task.title}
              </Link>
              <p className="text-xs text-ink-muted">
                {task.assignedTo?.name ?? 'Unassigned'} submitted this for review
              </p>
            </div>
            <TaskActions
              task={task}
              actor="leader"
              busy={busyId === task._id}
              onMove={(status) => onMove(task, status)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
