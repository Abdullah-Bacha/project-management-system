import Link from 'next/link'
import clsx from 'clsx'
import { PriorityBadge, TaskStatusBadge } from '@/components/ui/StatusBadge'
import { DueDate } from '@/components/ui/DueDate'
import { TaskActions } from './TaskActions'
import type { MyTask, TaskStatus } from '@/types'

interface MyTasksListProps {
  tasks: MyTask[]
  /** When given, each row gets the developer's workflow buttons (Start, Submit for Review…). */
  onStatusChange?: (task: MyTask, status: TaskStatus) => void
  /** Id of the task whose status is being saved. */
  busyId?: string | null
  /** Show a heading per project instead of repeating the project name on every row. */
  groupByProject?: boolean
  /** Always lay each row out top to bottom (title, then badges and actions): for a narrow container such as a drawer. */
  stacked?: boolean
}

function Row({
  task,
  onStatusChange,
  busyId,
  showProject,
  stacked,
}: {
  task: MyTask
  onStatusChange?: MyTasksListProps['onStatusChange']
  busyId?: string | null
  showProject: boolean
  stacked?: boolean
}) {
  return (
    <li
      className={clsx(
        'flex flex-col gap-2 px-5 py-3 transition-colors duration-200 hover:bg-surface-sunken',
        !stacked && 'sm:flex-row sm:items-center sm:justify-between sm:gap-4'
      )}
    >
      <Link href={`/dashboard/projects/${task.project._id}?task=${task._id}`} className="min-w-0">
        <p
          className={clsx(
            'text-sm font-medium text-ink',
            stacked ? 'break-words' : 'truncate',
            task.status === 'complete' && 'text-ink-muted line-through'
          )}
        >
          {task.title}
        </p>
        <p className={clsx('mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-ink-muted', stacked && 'flex-wrap')}>
          {showProject && (
            <>
              <span className="truncate font-medium text-ink-soft">{task.project.title}</span>
              <span aria-hidden="true">·</span>
            </>
          )}
          {task.assignedBy && <span className="hidden truncate sm:inline">from {task.assignedBy}</span>}
          <DueDate dueDate={task.dueDate} status={task.status} />
        </p>
      </Link>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        <TaskStatusBadge status={task.status} />
        {onStatusChange && (
          <TaskActions
            task={task}
            actor="developer"
            busy={busyId === task._id}
            onMove={(status) => onStatusChange(task, status)}
          />
        )}
      </div>
    </li>
  )
}

/** Rows linking to the project's work page, where the task opens in its panel. */
export function MyTasksList({ tasks, onStatusChange, busyId, groupByProject, stacked }: MyTasksListProps) {
  if (!groupByProject) {
    return (
      <ul className="divide-y divide-hairline">
        {tasks.map((task) => (
          <Row key={task._id} task={task} onStatusChange={onStatusChange} busyId={busyId} showProject stacked={stacked} />
        ))}
      </ul>
    )
  }

  const groups = new Map<string, { title: string; tasks: MyTask[] }>()
  for (const task of tasks) {
    const group = groups.get(task.project._id) ?? { title: task.project.title, tasks: [] }
    group.tasks.push(task)
    groups.set(task.project._id, group)
  }

  return (
    <div className="divide-y divide-hairline">
      {[...groups.entries()].map(([projectId, group]) => (
        <section key={projectId}>
          <h3 className="bg-surface-sunken/60 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {group.title}
          </h3>
          <ul className="divide-y divide-hairline">
            {group.tasks.map((task) => (
              <Row key={task._id} task={task} onStatusChange={onStatusChange} busyId={busyId} showProject={false} stacked={stacked} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
