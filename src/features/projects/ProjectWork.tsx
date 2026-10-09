'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { errorMessage } from '@/services/client'
import { tasksService } from '@/services/tasks.service'
import { useProject } from '@/features/projects/ProjectContext'
import { ActivityFeed } from '@/features/projects/ActivityFeed'
import { TaskFilterBar } from '@/features/tasks/TaskFilterBar'
import { TaskSearchResults } from '@/features/tasks/TaskSearchResults'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { cleanFilters, hasActiveFilters, type TaskFilters } from '@/lib/task-filters'
import { ProjectSwitcher } from '@/features/projects/ProjectSwitcher'
import { useProjectTasks } from '@/features/tasks/useProjectTasks'
import { KanbanBoard } from '@/features/tasks/KanbanBoard'
import { DeveloperBoard, UNASSIGNED, boardPeople } from '@/features/tasks/DeveloperBoard'
import { NewTaskForm } from '@/features/tasks/NewTaskForm'
import { ReviewQueue } from '@/features/tasks/ReviewQueue'
import { Button } from '@/components/ui/Button'
import { ErrorState } from '@/components/ui/PageState'
import { ProjectResources } from '@/features/projects/ProjectResources'
import type { Task, TaskStatus } from '@/types'

/**
 * The project's Work page: the one place the team leader manages work.
 *   - team leader / owner: developer cards, the review queue, and a developer's
 *     workspace (four columns + New Task);
 *   - developer: only their own tasks on the four columns.
 * Reached at /dashboard/projects/:id (and the older /kanban address).
 */
export function ProjectWork() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense fallback={<div className="skeleton h-40 rounded-card" />}>
      <WorkContent />
    </Suspense>
  )
}

function WorkContent() {
  const { project, can, applyProject } = useProject()
  const { user } = useAuth()
  const params = useSearchParams()
  const { tasks, loading, error, errorStatus, reload, upsertTask, removeTask } = useProjectTasks(project._id)
  const [showNewTask, setShowNewTask] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { notify, toastNode } = useToast()

  // Search and filters. The text is sent to the server after a short pause, not on every keystroke.
  const [filters, setFilters] = useState<TaskFilters>({})
  const debouncedText = useDebouncedValue(filters.q ?? '', 400)
  const effectiveFilters = cleanFilters({ ...filters, q: debouncedText })
  const searching = hasActiveFilters(effectiveFilters)

  const openTaskId = params.get('task')

  // Which developer's workspace is open: the ?developer= link, or the owner of a deep-linked task.
  const linkedTask = openTaskId ? tasks?.find((t) => t._id === openTaskId) : undefined
  const developerId = params.get('developer') ?? (linkedTask ? (linkedTask.assignedTo?._id ?? UNASSIGNED) : null)

  /** The team leader reviewing: Complete, Send Back, Reopen. The server decides if it is allowed. */
  const review = async (task: Task, status: TaskStatus) => {
    setBusyId(task._id)
    try {
      upsertTask(await tasksService.updateStatus(task._id, status))
    } catch (e) {
      notify('error', errorMessage(e, 'Could not update the task'))
      void reload()
    } finally {
      setBusyId(null)
    }
  }

  const board = (visible: Task[]) => (
    <KanbanBoard
      tasks={visible}
      onTaskChanged={upsertTask}
      onTaskRemoved={removeTask}
      onReload={reload}
      canEdit={can.canEdit}
      currentUserId={user?._id}
      members={project.members}
      initialOpenTaskId={openTaskId}
    />
  )

  const renderBody = () => {
    if (loading) {
      return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-36 rounded-card" />
          ))}
        </div>
      )
    }
    if (!tasks) return <ErrorState message={error} status={errorStatus} onRetry={reload} />

    // A search or filter replaces the boards with the matching tasks (the server decides what each person may see).
    if (searching) {
      return (
        <TaskSearchResults
          projectId={project._id}
          filters={effectiveFilters}
          isEditor={can.canEdit}
          onClear={() => setFilters({})}
        />
      )
    }

    // Developer: only the tasks assigned to them.
    if (!can.canEdit) {
      return (
        <>
          <p className="mb-4 text-sm text-ink-muted">
            Your tasks in <span className="font-medium text-ink">{project.title}</span>. Start a task, then
            submit it for review when it is ready. Your team leader completes it.
          </p>
          {board(tasks.filter((t) => t.assignedTo?._id === user?._id))}
        </>
      )
    }

    const people = boardPeople(project.members, tasks)
    const waiting = tasks.filter((t) => t.status === 'review')
    const queue = <ReviewQueue projectId={project._id} tasks={waiting} busyId={busyId} onMove={review} />

    // Team leader / owner, step 1: pick a developer.
    if (!developerId) {
      return (
        <>
          {queue}
          <p className="mb-4 text-sm text-ink-muted">
            Choose a developer to see their work on <span className="font-medium text-ink">{project.title}</span>{' '}
            and give them a task.
          </p>
          <DeveloperBoard projectId={project._id} people={people} />
        </>
      )
    }

    // Step 2: that developer's workspace.
    const person = people.find((p) => p.id === developerId)
    const isUnassigned = developerId === UNASSIGNED
    const assignee = isUnassigned ? null : (project.members.find((m) => m._id === developerId) ?? null)
    const name = isUnassigned ? 'Unassigned' : (assignee?.name ?? person?.name ?? 'Developer')

    return (
      <>
        {queue}
        <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/dashboard/projects/${project._id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-interactive hover:text-interactive-hover"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All developers
            </Link>
            <h2 className="mt-1 truncate text-base font-semibold text-ink">
              <span className="text-ink-muted">Project:</span> {project.title}
              <span className="mx-2 text-ink-faint">·</span>
              <span className="text-ink-muted">Developer:</span> {name}
            </h2>
          </div>
          {!showNewTask && (
            <Button onClick={() => setShowNewTask(true)} icon={<Plus className="h-4 w-4" />}>
              New Task
            </Button>
          )}
        </div>

        {showNewTask && (
          <NewTaskForm
            projectId={project._id}
            projectTitle={project.title}
            assignee={isUnassigned ? null : assignee}
            members={project.members}
            onCancel={() => setShowNewTask(false)}
            onCreated={(task) => {
              upsertTask(task)
              notify('success', `Task created${task.assignedTo ? ` and assigned to ${task.assignedTo.name}` : ''}`)
              setShowNewTask(false)
            }}
          />
        )}

        {board(person?.tasks ?? [])}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <ProjectSwitcher currentId={project._id} />
        {tasks && (
          <div className="mb-5">
            <TaskFilterBar
              filters={filters}
              onChange={setFilters}
              meId={user?._id}
              developers={can.canEdit ? project.members.filter((m) => m.role === 'developer') : undefined}
              creators={can.canEdit ? project.members.filter((m) => m.role !== 'developer') : undefined}
            />
          </div>
        )}
        {renderBody()}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ActivityFeed projectId={project._id} />
        <ProjectResources project={project} canEdit={can.canEdit} onLinksChanged={(referenceLinks) => applyProject({ referenceLinks })} />
      </div>
      {toastNode}
    </div>
  )
}
