'use client'

import { useEffect, useState } from 'react'
import { CornerDownRight, Link2, Lock, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TaskStatusBadge } from '@/components/ui/StatusBadge'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { dependenciesService } from '@/services/dependencies.service'
import { errorMessage } from '@/services/client'
import { tasksService } from '@/services/tasks.service'
import type { DependencyEntry, Task, TaskDependencies as Dependencies } from '@/types'

const MAX_RESULTS = 8

interface Props {
  taskId: string
  projectId: string
  /** Owner or team leader: may add and remove. Everyone else only reads. */
  canManage: boolean
}

function Row({ entry, onRemove, busy }: { entry: DependencyEntry; onRemove?: () => void; busy: boolean }) {
  return (
    <li className="flex items-center gap-2 rounded-xl border border-hairline px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" title={entry.task.title}>
          {entry.task.title}
        </p>
        {entry.task.assignee && <p className="truncate text-xs text-ink-muted">{entry.task.assignee.name}</p>}
      </div>
      <TaskStatusBadge status={entry.task.status} className="shrink-0" />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Remove dependency on ${entry.task.title}`}
          className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-critical-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </li>
  )
}

/** Picks the task that must finish first. Search-first, so a big project never loads into one long list. */
function AddDependency({ taskId, projectId, exclude, onDone }: { taskId: string; projectId: string; exclude: Set<string>; onDone: () => void }) {
  const [text, setText] = useState('')
  const query = useDebouncedValue(text, 300)
  const [results, setResults] = useState<Task[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    tasksService
      .searchInProject(projectId, query)
      .then((tasks) => !cancelled && setResults(tasks))
      .catch(() => !cancelled && setResults([]))
    return () => {
      cancelled = true
    }
  }, [projectId, query])

  const choices = (results ?? []).filter((t) => t._id !== taskId && !exclude.has(t._id)).slice(0, MAX_RESULTS)

  const submit = async () => {
    if (!selected) return
    setSaving(true)
    setError('')
    try {
      await dependenciesService.add(taskId, selected)
      onDone()
    } catch (e) {
      setError(errorMessage(e, 'Could not add the dependency.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-hairline bg-surface-sunken p-3" role="group" aria-label="Add dependency">
      <p className="text-sm font-medium text-ink">This task is blocked by:</p>
      <Input
        id="dependency-search"
        label="Find a task"
        placeholder="Search by title"
        value={text}
        maxLength={100}
        onChange={(e) => {
          setText(e.target.value)
          setSelected(null)
        }}
      />
      <ul className="max-h-48 space-y-1 overflow-y-auto" aria-label="Matching tasks">
        {results === null ? (
          <li className="px-1 text-xs text-ink-muted">Loading…</li>
        ) : choices.length === 0 ? (
          <li className="px-1 text-xs text-ink-muted">No matching tasks.</li>
        ) : (
          choices.map((t) => (
            <li key={t._id}>
              <button
                type="button"
                onClick={() => setSelected(t._id)}
                aria-pressed={selected === t._id}
                className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                  selected === t._id ? 'border-interactive bg-surface' : 'border-transparent bg-surface hover:border-hairline'
                }`}
              >
                <span className="min-w-0 flex-1 truncate" title={t.title}>
                  {t.title}
                </span>
                <TaskStatusBadge status={t.status} className="shrink-0" />
              </button>
            </li>
          ))
        )}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-critical-strong">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={!selected || saving}>
          {saving ? 'Adding…' : 'Add dependency'}
        </Button>
      </div>
    </div>
  )
}

/**
 * What blocks this task and what it blocks. A dependency is information, not a
 * status: the task keeps its own status and nothing here moves it.
 */
export function TaskDependencies({ taskId, projectId, canManage }: Props) {
  const { data, error, isLoading, refetch } = useRealtimeData<Dependencies>({
    endpoint: `/api/tasks/${taskId}/dependencies`,
    watch: ['tasks', 'activities'],
    match: (signal) => !signal.projectId || signal.projectId === projectId,
  })
  const [adding, setAdding] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const remove = async (entry: DependencyEntry) => {
    setBusyId(entry._id)
    setMessage('')
    try {
      await dependenciesService.remove(taskId, entry._id)
      await refetch()
    } catch (e) {
      setMessage(errorMessage(e, 'Could not remove the dependency.'))
    } finally {
      setBusyId(null)
    }
  }

  const blockedBy = data?.blockedBy ?? []
  const blocks = data?.blocks ?? []
  const unresolved = data?.unresolved ?? 0
  const connected = new Set([...blockedBy, ...blocks].map((e) => e.task._id))

  return (
    <section aria-labelledby="dependencies-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="dependencies-title" className="flex items-center gap-1.5 text-sm font-medium text-ink-soft">
          <Link2 className="h-4 w-4 text-ink-faint" />
          Dependencies
        </h3>
        {canManage && !adding && (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} aria-label="Add dependency">
            <Plus className="h-4 w-4" />
            Add dependency
          </Button>
        )}
      </div>

      {adding && (
        <AddDependency
          taskId={taskId}
          projectId={projectId}
          exclude={connected}
          onDone={() => {
            setAdding(false)
            void refetch()
          }}
        />
      )}

      {error && !data ? (
        <p className="text-sm text-critical-strong">Could not load dependencies.</p>
      ) : isLoading && !data ? (
        <div className="skeleton h-12 rounded-xl" />
      ) : (
        <>
          {message && (
            <p role="alert" className="text-sm text-critical-strong">
              {message}
            </p>
          )}

          <div>
            <p className="mb-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-ink-muted">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Blocked by
              {unresolved > 0 ? (
                <span className="rounded-full bg-caution-subtle px-2 py-0.5 text-caution-strong">
                  Blocked by {unresolved} {unresolved === 1 ? 'task' : 'tasks'}
                </span>
              ) : blockedBy.length > 0 ? (
                <span className="rounded-full bg-positive-subtle px-2 py-0.5 text-positive-strong">No unresolved blockers</span>
              ) : null}
            </p>
            {blockedBy.length === 0 ? (
              <p className="text-sm text-ink-muted">Nothing blocks this task.</p>
            ) : (
              <ul className="space-y-1.5">
                {blockedBy.map((e) => (
                  <Row key={e._id} entry={e} busy={busyId === e._id} onRemove={canManage ? () => remove(e) : undefined} />
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
              <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
              Blocks
            </p>
            {blocks.length === 0 ? (
              <p className="text-sm text-ink-muted">This task does not block any other task.</p>
            ) : (
              <ul className="space-y-1.5">
                {blocks.map((e) => (
                  <Row key={e._id} entry={e} busy={busyId === e._id} onRemove={canManage ? () => remove(e) : undefined} />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
