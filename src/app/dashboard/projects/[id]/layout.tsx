'use client'

import { useParams } from 'next/navigation'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { ProjectProvider, NO_CAPABILITIES } from '@/features/projects/ProjectContext'
import { ProjectTabs } from '@/features/projects/ProjectTabs'
import { ProjectPeople } from '@/features/projects/ProjectPeople'
import { BackLink } from '@/components/ui/BackLink'
import { ErrorState, PageSkeleton } from '@/components/ui/PageState'
import type { Project } from '@/types'

/**
 * Shared frame for every project page: loads the project once, keeps it live
 * (progress, members and team update as the server reports changes), renders
 * the title and tabs, and owns the loading / not-found / error states so the
 * individual pages only deal with their own content.
 */
export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()

  const { data, isLoading, error, errorStatus, refetch, mutate } = useRealtimeData<{ project: Project }>({
    endpoint: `/api/projects/${id}`,
    watch: ['projects', 'teams'],
    // Only this project's signals (team signals carry no project id).
    match: (signal) => signal.collection === 'teams' || signal.projectId === id,
  })

  // Gone or off-limits (e.g. deleted or removed from it while open): say so,
  // even if an older copy is still in memory.
  const unavailable = errorStatus === 404 || errorStatus === 403

  const back = <BackLink href="/dashboard/projects" className="mb-4">Back to projects</BackLink>
  const backTo = { href: '/dashboard/projects', label: 'Back to projects' }

  if (unavailable) return <>{back}<ErrorState status={errorStatus} back={backTo} /></>
  if (!data) {
    return isLoading ? (
      <>{back}<PageSkeleton /></>
    ) : (
      <>{back}<ErrorState message={error} status={errorStatus} onRetry={refetch} back={backTo} /></>
    )
  }

  const { project } = data

  return (
    <ProjectProvider
      value={{
        project,
        can: project.capabilities ?? NO_CAPABILITIES,
        applyProject: (changes) => mutate((current) => ({ project: { ...current.project, ...changes } })),
      }}
    >
      <div className="flex h-full flex-col">
        <div className="shrink-0">{back}</div>
        <header className="animate-rise shrink-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{project.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{project.description || 'No description yet.'}</p>
          <ProjectPeople project={project} />
        </header>

        <ProjectTabs projectId={project._id} />

        <div className="mt-6 min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </ProjectProvider>
  )
}
