'use client'

import { useEffect, useState, useCallback } from 'react'
import clsx from 'clsx'
import {
  X,
  Trash2,
  Send,
  Loader2,
  MessageSquare,
  Save,
  Lock,
} from 'lucide-react'
import { Task, TaskStatus, TaskPriority } from '@/types'
import { tasksService } from '@/services/tasks.service'
import { projectsService } from '@/services/projects.service'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface TaskDetailPanelProps {
  taskId: string
  projectId: string
  onClose: () => void
  /** Called after a save or delete so the board can refresh. */
  onChanged: () => void
  /** Admin or the project's team leader — can fully edit and delete the task. */
  isEditor: boolean
  currentUserId?: string
}

const statuses: TaskStatus[] = ['todo', 'in-progress', 'review', 'complete']
const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent']

/** `<input type="date">` needs yyyy-MM-dd; the API returns an ISO string. */
function toDateInput(value?: string | Date | null) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export function TaskDetailPanel({
  taskId,
  projectId,
  onClose,
  onChanged,
  isEditor,
  currentUserId,
}: TaskDetailPanelProps) {
  const [task, setTask] = useState<Task | null>(null)
  const [members, setMembers] = useState<any[]>([])
  const [comments, setComments] = useState<any[]>([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    status: 'todo' as TaskStatus,
    priority: 'medium' as TaskPriority,
    dueDate: '',
    assignedTo: '',
    estimatedHours: 0,
    actualHours: 0,
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [t, m, c] = await Promise.all([
        tasksService.getOne(taskId),
        projectsService.getMembers(projectId).catch(() => []),
        tasksService.getComments(taskId).catch(() => []),
      ])

      setTask(t)
      setMembers(m ?? [])
      setComments(c ?? [])
      setForm({
        title: t.title ?? '',
        description: t.description ?? '',
        status: t.status,
        priority: t.priority,
        dueDate: toDateInput(t.dueDate),
        assignedTo: t.assignedTo?._id ?? t.assignedTo ?? '',
        estimatedHours: t.estimatedHours ?? 0,
        actualHours: t.actualHours ?? 0,
      })
    } catch {
      setError('Could not load this task.')
    } finally {
      setLoading(false)
    }
  }, [taskId, projectId])

  useEffect(() => {
    load()
  }, [load])

  // Escape closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const assigneeId = task?.assignedTo
    ? (task.assignedTo as any)._id ?? task.assignedTo
    : null
  const isAssignee = Boolean(currentUserId && assigneeId === currentUserId)
  // A developer's one write action: move a task assigned to them. Everything
  // else here is either full-edit (editors) or read-only.
  const canChangeStatus = isEditor || isAssignee

  const handleSave = async () => {
    if (form.title.trim().length < 3) {
      setError('Title must be at least 3 characters')
      return
    }

    setError('')
    setSaving(true)
    try {
      await tasksService.update(taskId, {
        title: form.title.trim(),
        description: form.description,
        status: form.status,
        priority: form.priority,
        // null clears the field server-side; '' would fail validation.
        dueDate: form.dueDate || null,
        assignedTo: form.assignedTo || null,
        estimatedHours: Number(form.estimatedHours) || 0,
        actualHours: Number(form.actualHours) || 0,
      })
      onChanged()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleStatusOnly = async () => {
    setError('')
    setSaving(true)
    try {
      await tasksService.updateStatus(taskId, form.status)
      onChanged()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await tasksService.delete(taskId)
      onChanged()
      onClose()
    } catch {
      setError('Failed to delete')
      setDeleting(false)
    }
  }

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return

    setPosting(true)
    try {
      const created = await tasksService.addComment(taskId, commentText.trim())
      setComments((prev) => [created, ...prev])
      setCommentText('')
    } catch {
      setError('Failed to post comment')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        onClick={onClose}
        aria-label="Close"
        className="animate-fade absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        className="animate-rise relative flex h-full w-full max-w-lg flex-col border-l border-hairline bg-surface shadow-lifted"
      >
        <header className="flex shrink-0 items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-sm font-medium text-ink-muted">Task details</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
            aria-label="Close panel"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </header>

        {loading ? (
          <div className="flex-1 space-y-3 p-5">
            <div className="skeleton h-10 rounded-xl" />
            <div className="skeleton h-24 rounded-xl" />
            <div className="skeleton h-10 rounded-xl" />
          </div>
        ) : !task ? (
          <p className="p-5 text-sm text-critical">{error || 'Task not found.'}</p>
        ) : (
          <>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {!isEditor && (
                <p className="flex items-center gap-1.5 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
                  <Lock className="h-3.5 w-3.5" />
                  {isAssignee
                    ? 'Only your team leader can edit this task — you can update its status and leave feedback below.'
                    : 'Only your team leader can edit this task.'}
                </p>
              )}

              {isEditor ? (
                <Input
                  label="Title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              ) : (
                <ReadField label="Title" value={task.title} />
              )}

              {isEditor ? (
                <div>
                  <label
                    htmlFor="task-description"
                    className="mb-1.5 block text-sm font-medium text-ink-soft"
                  >
                    Description
                  </label>
                  <textarea
                    id="task-description"
                    rows={4}
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    placeholder="Add more detail…"
                    className="w-full resize-y rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
                  />
                </div>
              ) : (
                <ReadField
                  label="Description"
                  value={task.description || '—'}
                  multiline
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <Select
                  label="Status"
                  value={form.status}
                  onChange={(v) => setForm({ ...form, status: v as TaskStatus })}
                  options={statuses.map((s) => ({
                    value: s,
                    label: s.replace('-', ' '),
                  }))}
                  disabled={!canChangeStatus}
                />
                {isEditor ? (
                  <Select
                    label="Priority"
                    value={form.priority}
                    onChange={(v) =>
                      setForm({ ...form, priority: v as TaskPriority })
                    }
                    options={priorities.map((p) => ({ value: p, label: p }))}
                  />
                ) : (
                  <ReadField label="Priority" value={task.priority} capitalize />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {isEditor ? (
                  <Input
                    label="Due date"
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                  />
                ) : (
                  <ReadField
                    label="Due date"
                    value={
                      task.dueDate
                        ? new Date(task.dueDate).toLocaleDateString()
                        : '—'
                    }
                  />
                )}
                {isEditor ? (
                  <Select
                    label="Assignee"
                    value={form.assignedTo}
                    onChange={(v) => setForm({ ...form, assignedTo: v })}
                    options={[
                      { value: '', label: 'Unassigned' },
                      ...members.map((m) => ({ value: m._id, label: m.name })),
                    ]}
                  />
                ) : (
                  <ReadField
                    label="Assignee"
                    value={(task.assignedTo as any)?.name || 'Unassigned'}
                  />
                )}
              </div>

              {isEditor && (
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Estimated hours"
                    type="number"
                    min={0}
                    value={form.estimatedHours}
                    onChange={(e) =>
                      setForm({ ...form, estimatedHours: Number(e.target.value) })
                    }
                  />
                  <Input
                    label="Actual hours"
                    type="number"
                    min={0}
                    value={form.actualHours}
                    onChange={(e) =>
                      setForm({ ...form, actualHours: Number(e.target.value) })
                    }
                  />
                </div>
              )}

              {/* Comments — the feedback channel every project member has,
                  regardless of edit rights. */}
              <section className="border-t border-hairline pt-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
                  <MessageSquare className="h-4 w-4 text-ink-muted" />
                  Comments
                  <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-medium text-ink-muted">
                    {comments.length}
                  </span>
                </h3>

                <form onSubmit={handleComment} className="mb-4 flex gap-2">
                  <input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write feedback…"
                    className="h-10 flex-1 rounded-xl border border-hairline bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
                  />
                  <button
                    type="submit"
                    disabled={posting || !commentText.trim()}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
                    aria-label="Post comment"
                  >
                    {posting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </form>

                {comments.length === 0 ? (
                  <p className="py-4 text-center text-xs text-ink-faint">
                    No comments yet
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {comments.map((c) => (
                      <li key={c._id} className="flex gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent text-xs font-semibold text-white">
                          {c.userId?.name?.charAt(0).toUpperCase() ?? '?'}
                        </span>
                        <div className="min-w-0 flex-1 rounded-xl bg-surface-sunken px-3 py-2">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-medium text-ink">
                              {c.userId?.name ?? 'Unknown'}
                            </span>
                            <span className="text-[11px] text-ink-faint">
                              {new Date(c.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="mt-0.5 break-words text-sm text-ink-soft">
                            {c.text}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <footer className="shrink-0 space-y-3 border-t border-hairline p-5">
              {error && <p className="text-sm text-critical">{error}</p>}

              {isEditor ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2 rounded-xl border border-critical/30 bg-critical/6 p-3">
                    <p className="flex-1 text-sm text-ink">Delete this task?</p>
                    <Button
                      size="sm"
                      variant="danger"
                      isLoading={deleting}
                      onClick={handleDelete}
                    >
                      Delete
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                    >
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
                      className="text-critical hover:bg-critical/8"
                      icon={<Trash2 className="h-4 w-4" />}
                    >
                      Delete
                    </Button>
                  </div>
                )
              ) : (
                canChangeStatus && (
                  <Button
                    onClick={handleStatusOnly}
                    isLoading={saving}
                    disabled={form.status === task.status}
                    className="w-full"
                    icon={<Save className="h-4 w-4" />}
                  >
                    Update status
                  </Button>
                )
              )}
            </footer>
          </>
        )}
      </aside>
    </div>
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

function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink-soft">
        {label}
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={clsx(
          'h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm capitalize text-ink',
          'transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="capitalize">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
