'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { Trash2, Save, Lock } from 'lucide-react'
import { tasksService } from '@/services/tasks.service'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { TaskStatusBadge } from '@/components/ui/StatusBadge'
import { TaskActions } from './TaskActions'
import { TaskAttachments } from './TaskAttachments'
import { TaskDependencies } from './TaskDependencies'
import { TaskComments } from './TaskComments'
import {
  TASK_PRIORITIES,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type UserSummary,
} from '@/types'
import { errorMessage } from '@/services/client'
import { formatDateTime, formatDuration } from '@/lib/format'
import { dateOnly, formatDueDate } from '@/lib/due-date'
import { DueDate } from '@/components/ui/DueDate'

interface TaskFormProps {
  task: Task
  members: UserSummary[]
  /** Owner or team leader: may edit every field and delete the task. */
  canEdit: boolean
  currentUserId?: string
  onSaved: (task: Task) => void
  onDeleted: (taskId: string) => void
}

/** `<input type="date">` needs yyyy-MM-dd: the due day, never shifted by timezone. */
const toDateInput = dateOnly

/**
 * The body and footer of the task panel. Editors get the full form; a
 * developer sees the task read-only and — when it is assigned to them — can
 * change its status, their one write action. Comments are open to everyone.
 */
export function TaskForm({ task, members, canEdit, currentUserId, onSaved, onDeleted }: TaskFormProps) {
  const [form, setForm] = useState({
    title: task.title ?? '',
    description: task.description ?? '',
    priority: task.priority,
    dueDate: toDateInput(task.dueDate),
    assignedTo: task.assignedTo?._id ?? '',
    estimatedHours: task.estimatedHours ?? 0,
    actualHours: task.actualHours ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')

  const isAssignee = Boolean(currentUserId && task.assignedTo?._id === currentUserId)
  const canChangeStatus = canEdit || isAssignee

  const run = async (action: () => Promise<Task>, failure: string) => {
    setError('')
    setSaving(true)
    try {
      onSaved(await action())
    } catch (e) {
      setError(errorMessage(e, failure))
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => {
    if (form.title.trim().length < 3) {
      setError('Title must be at least 3 characters')
      return
    }
    void run(
      () =>
        tasksService.update(task._id, {
          title: form.title.trim(),
          description: form.description,
          priority: form.priority,
          // null clears the field server-side; '' would fail validation.
          dueDate: form.dueDate || null,
          assignedTo: form.assignedTo || null,
          estimatedHours: Number(form.estimatedHours) || 0,
          actualHours: Number(form.actualHours) || 0,
        }),
      'Failed to save'
    )
  }

  const handleMove = (status: TaskStatus) =>
    void run(() => tasksService.updateStatus(task._id, status), 'Failed to update status')

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await tasksService.delete(task._id)
      onDeleted(task._id)
    } catch {
      setError('Failed to delete')
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {!canEdit && (
          <p className="flex items-center gap-1.5 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
            <Lock className="h-3.5 w-3.5" />
            {isAssignee
              ? 'Only your team leader can edit this task — you can update its status and leave feedback below.'
              : 'Only your team leader can edit this task.'}
          </p>
        )}

        {canEdit ? (
          <Input
            label="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        ) : (
          <ReadField label="Title" value={task.title} />
        )}

        {canEdit ? (
          <Textarea
            label="Description"
            id="task-description"
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Add more detail…"
          />
        ) : (
          <ReadField label="Description" value={task.description || '—'} multiline />
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink-soft">Status</p>
            <TaskStatusBadge status={task.status} />
          </div>
          {canEdit ? (
            <Select
              label="Priority"
              value={form.priority}
              className="capitalize"
              onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
            >
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          ) : (
            <ReadField label="Priority" value={task.priority} capitalize />
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {canEdit ? (
            <div>
              <Input
                label="Due date"
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
              {form.dueDate ? (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, dueDate: '' })}
                  className="mt-1.5 text-xs font-medium text-interactive hover:text-interactive-hover"
                >
                  Remove due date
                </button>
              ) : (
                <p className="mt-1.5 text-xs text-ink-faint">No due date</p>
              )}
            </div>
          ) : (
            <div>
              <ReadField
                label="Due date"
                value={task.dueDate ? formatDueDate(task.dueDate) : 'No due date'}
              />
              {task.status !== 'complete' && <DueDate dueDate={task.dueDate} status={task.status} className="mt-1.5" />}
            </div>
          )}
          {canEdit ? (
            <Select
              label="Assignee"
              value={form.assignedTo}
              onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </Select>
          ) : (
            <ReadField label="Assignee" value={task.assignedTo?.name || 'Unassigned'} />
          )}
        </div>

        {canChangeStatus && (
          <TaskActions task={task} actor={canEdit ? 'leader' : 'developer'} busy={saving} onMove={handleMove} />
        )}

        <TaskTimeline task={task} />

        {canEdit && (
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Estimated hours"
              type="number"
              min={0}
              value={form.estimatedHours}
              onChange={(e) => setForm({ ...form, estimatedHours: Number(e.target.value) })}
            />
            <Input
              label="Actual hours"
              type="number"
              min={0}
              value={form.actualHours}
              onChange={(e) => setForm({ ...form, actualHours: Number(e.target.value) })}
            />
          </div>
        )}

        <TaskDependencies taskId={task._id} projectId={task.projectId} canManage={canEdit} />

        <TaskAttachments
          taskId={task._id}
          canUpload={canEdit || isAssignee}
          canDeleteAny={canEdit}
          currentUserId={currentUserId}
        />

        <TaskComments taskId={task._id} />
      </div>

      <footer className="shrink-0 space-y-3 border-t border-hairline p-5">
        {error && <p className="text-sm text-critical-strong">{error}</p>}

        {canEdit ? (
          confirmDelete ? (
            <div className="flex items-center gap-2 rounded-xl border border-critical/30 bg-critical-subtle p-3">
              <p className="flex-1 text-sm text-ink">Delete this task?</p>
              <Button size="sm" variant="danger" isLoading={deleting} onClick={handleDelete}>
                Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                isLoading={saving}
                className="flex-1"
                icon={<Save className="h-4 w-4" />}
              >
                Save changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(true)}
                className="text-critical-strong hover:bg-critical-subtle"
                icon={<Trash2 className="h-4 w-4" />}
              >
                Delete
              </Button>
            </div>
          )
        ) : null}
      </footer>
    </>
  )
}

/** When the task was created, actually started and finished (server times); duration only when both exist. */
function TaskTimeline({ task }: { task: Task }) {
  const took = formatDuration(task.startedAt, task.completedAt)
  const rows = [
    ['Created', formatDateTime(task.createdAt)],
    ['Started', task.startedAt ? formatDateTime(task.startedAt) : 'Not started yet'],
    ['Completed', task.completedAt ? formatDateTime(task.completedAt) : '—'],
    ...(took ? [['Elapsed', took]] : []),
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-hairline bg-surface-sunken px-4 py-3 text-xs">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-ink-muted">{label}</dt>
          <dd className="mt-0.5 font-medium text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function ReadField({
  label,
  value,
  multiline,
  capitalize,
}: {
  label: string
  value: string
  multiline?: boolean
  capitalize?: boolean
}) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink-soft">{label}</p>
      <p
        className={clsx(
          'rounded-xl border border-hairline bg-surface-sunken px-4 py-2.5 text-sm text-ink-soft',
          multiline && 'whitespace-pre-line',
          capitalize && 'capitalize'
        )}
      >
        {value}
      </p>
    </div>
  )
}
