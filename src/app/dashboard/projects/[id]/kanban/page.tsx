'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, X, ArrowLeft } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { tasksService } from '@/services/tasks.service'
import { useAuth } from '@/hooks/useAuth'
import { KanbanBoard } from '@/components/tasks/KanbanBoard'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast } from '@/components/ui/Toast'

export default function KanbanPage() {
  const params = useParams()
  const projectId = params.id as string
  const { user } = useAuth()

  const [project, setProject] = useState<any>(null)
  const [showNewTaskForm, setShowNewTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)

  useEffect(() => {
    if (!projectId) return
    projectsService
      .getOne(projectId)
      .then(setProject)
      .catch((error) => console.error('Failed to load project:', error))
  }, [projectId])

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault()

    // The API requires at least 3 characters; catch it before the round trip.
    if (taskTitle.trim().length < 3) {
      setToast({
        type: 'error',
        message: 'Task title must be at least 3 characters',
      })
      return
    }

    try {
      setLoading(true)
      await tasksService.create(projectId, {
        title: taskTitle.trim(),
        priority: 'medium',
      })
      setToast({ type: 'success', message: 'Task created' })
      setTaskTitle('')
      setShowNewTaskForm(false)
      setRefreshKey((k) => k + 1)
    } catch {
      setToast({ type: 'error', message: 'Failed to create task' })
    } finally {
      setLoading(false)
    }
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="skeleton h-8 w-56 rounded-lg" />
        <div className="skeleton h-64 rounded-card" />
      </div>
    )
  }

  const ownerId =
    typeof project.owner === 'string' ? project.owner : project.owner?._id
  const isEditor = Boolean(
    user &&
      (ownerId === user._id || project.team?.teamLeader?._id === user._id)
  )

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      <header className="animate-rise mb-6">
        <Link
          href={`/dashboard/projects/${projectId}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to overview
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {project.title}
            </h1>
            <p className="mt-1 text-sm text-ink-muted">
              {project.description || 'Drag work through the pipeline.'}
            </p>
          </div>

          {isEditor && !showNewTaskForm && (
            <Button
              onClick={() => setShowNewTaskForm(true)}
              icon={<Plus className="h-4 w-4" />}
            >
              New Task
            </Button>
          )}
        </div>
      </header>

      {showNewTaskForm && (
        <form
          onSubmit={handleAddTask}
          className="animate-rise mb-5 flex flex-wrap items-start gap-2 rounded-card border border-hairline bg-surface p-3 shadow-card"
        >
          <div className="min-w-56 flex-1">
            <Input
              placeholder="What needs to be done?"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              autoFocus
            />
          </div>
          <Button type="submit" isLoading={loading}>
            Add task
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setShowNewTaskForm(false)
              setTaskTitle('')
            }}
            icon={<X className="h-4 w-4" />}
          >
            Cancel
          </Button>
        </form>
      )}

      <div className="min-h-0 flex-1">
        <KanbanBoard
          projectId={projectId}
          refreshKey={refreshKey}
          isEditor={isEditor}
          currentUserId={user?._id}
        />
      </div>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
