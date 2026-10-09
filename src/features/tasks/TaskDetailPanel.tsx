'use client'

import { tasksService } from '@/services/tasks.service'
import { useLoad } from '@/hooks/useLoad'
import { Modal } from '@/components/ui/Modal'
import { TaskForm } from './TaskForm'
import type { Task, UserSummary } from '@/types'

interface TaskDetailPanelProps {
  taskId: string
  onClose: () => void
  /** Called with the saved task so the board can merge it. */
  onSaved: (task: Task) => void
  onDeleted: (taskId: string) => void
  /** Owner or team leader — can fully edit and delete the task. */
  canEdit: boolean
  currentUserId?: string
  /** The project's members, for the assignee picker (the page already has them). */
  members: UserSummary[]
}

/**
 * The side panel for one task. The task is read fresh when the panel opens
 * (so an edit never starts from a stale copy); the form itself lives in
 * TaskForm.
 */
export function TaskDetailPanel({
  taskId,
  onClose,
  onSaved,
  onDeleted,
  canEdit,
  currentUserId,
  members,
}: TaskDetailPanelProps) {
  const task = useLoad(() => tasksService.getOne(taskId), [taskId])

  return (
    <Modal title="Task details" placement="right" onClose={onClose}>
      {task.loading ? (
        <div className="flex-1 space-y-3 p-5">
          <div className="skeleton h-10 rounded-xl" />
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-10 rounded-xl" />
        </div>
      ) : !task.data ? (
        <p className="p-5 text-sm text-critical-strong">
          {task.errorStatus === 404 ? 'This task no longer exists.' : task.error || 'Could not load this task.'}
        </p>
      ) : (
        <TaskForm
          task={task.data}
          members={members}
          canEdit={canEdit}
          currentUserId={currentUserId}
          onSaved={(saved) => {
            onSaved(saved)
            onClose()
          }}
          onDeleted={(id) => {
            onDeleted(id)
            onClose()
          }}
        />
      )}
    </Modal>
  )
}
