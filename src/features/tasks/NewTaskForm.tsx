'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import { tasksService } from '@/services/tasks.service'
import { errorMessage } from '@/services/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { TASK_PRIORITIES, type Task, type TaskPriority, type UserSummary } from '@/types'

interface NewTaskFormProps {
  projectId: string
  projectTitle: string
  /** The developer whose workspace this is, or null to let the leader pick. */
  assignee: UserSummary | null
  /** Candidates for the picker when no developer is preselected. */
  members: UserSummary[]
  onCreated: (task: Task) => void
  onCancel: () => void
}

/** Create a task with the project and developer already filled in. New tasks always start as To Do. */
export function NewTaskForm({ projectId, projectTitle, assignee, members, onCreated, onCancel }: NewTaskFormProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [dueDate, setDueDate] = useState('')
  const [assignedTo, setAssignedTo] = useState(assignee?._id ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // The API requires at least 3 characters; catch it before the round trip.
    if (title.trim().length < 3) return setError('Task title must be at least 3 characters')

    setSaving(true)
    try {
      onCreated(
        await tasksService.create(projectId, {
          title: title.trim(),
          ...(description.trim() && { description: description.trim() }),
          priority,
          ...(dueDate && { dueDate }),
          ...(assignedTo && { assignedTo }),
        })
      )
    } catch (err) {
      setError(errorMessage(err, 'Failed to create task'))
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-rise mb-5 shrink-0 rounded-card border border-hairline bg-surface p-5 shadow-card"
    >
      <h2 className="text-sm font-semibold text-ink">New task</h2>

      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-muted">Project</dt>
          <dd className="font-medium text-ink">{projectTitle}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Assigned to</dt>
          <dd className="font-medium text-ink">
            {assignee ? (
              assignee.name
            ) : (
              <Select
                aria-label="Assigned to"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 rounded-lg text-sm"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">Status</dt>
          <dd className="font-medium text-ink">To Do</dd>
        </div>
      </dl>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Task title"
            placeholder="e.g. Build login page"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />
        </div>
        <div className="sm:col-span-2">
          <Textarea
            label="Description"
            id="new-task-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What should be done?"
          />
        </div>
        <Select label="Priority" value={priority} className="capitalize" onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>

      {error && <p className="mt-3 text-sm text-critical-strong">{error}</p>}

      <div className="mt-4 flex gap-2 border-t border-hairline pt-4">
        <Button type="submit" isLoading={saving}>
          Create task
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} icon={<X className="h-4 w-4" />}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
