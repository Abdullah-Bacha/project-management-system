'use client'

import { Plus, FolderKanban, LayoutTemplate } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { useState } from 'react'
import { ProjectCard } from '@/features/projects/ProjectCard'
import { EditProjectModal } from '@/features/projects/EditProjectModal'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import type { Project } from '@/types'

export default function ProjectsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  // Live: a new project, a staffing change or a progress update shows up
  // without a reload.
  const { data, isLoading, error, errorStatus, refetch } = useRealtimeData<{
    projects: Project[]
    total: number
  }>({
    endpoint: '/api/projects?skip=0&limit=50',
    watch: ['projects', 'teams'],
  })
  const projects = data?.projects ?? []
  const [editing, setEditing] = useState<Project | null>(null)
  const { notify, toastNode } = useToast()

  const newProject = isAdmin && (
    <ButtonLink href="/dashboard/projects/new" icon={<Plus className="h-4 w-4" />}>
      New Project
    </ButtonLink>
  )

  return (
    <div>
      <header className="animate-rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Projects</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {isLoading
              ? 'Loading…'
              : data
                ? `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`
                : 'Could not load projects'}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/dashboard/projects/templates" variant="secondary" icon={<LayoutTemplate className="h-4 w-4" />}>
              Templates
            </ButtonLink>
            {newProject}
          </div>
        )}
      </header>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-52 rounded-card" />
          ))}
        </div>
      ) : !data ? (
        <ErrorState message={error} status={errorStatus} onRetry={refetch} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6" />}
          title="No projects yet"
          action={newProject}
        >
          {isAdmin
            ? 'Projects hold your tasks, team and timeline. Create one to begin.'
            : "You'll see projects here once an admin staffs your team onto one."}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {projects.map((project, i) => (
            <ProjectCard
              key={project._id}
              project={project}
              delay={i * 0.05}
              // The admin who owns the project can edit it from here (the server checks it too).
              onEdit={isAdmin && project.owner?._id === user?._id ? () => setEditing(project) : undefined}
            />
          ))}
        </div>
      )}

      {editing && (
        <EditProjectModal
          project={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            notify('success', 'Project updated')
            void refetch()
          }}
        />
      )}
      {toastNode}
    </div>
  )
}
