import Link from 'next/link'
import { ArrowRight, FolderKanban, Plus } from 'lucide-react'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { ProjectCard } from '@/features/projects/ProjectCard'
import type { Project, ProjectAnalytics, UserRole } from '@/types'

interface ProjectOverviewProps {
  projects: Project[]
  /** How many projects the user has in total (may exceed what is shown). */
  total: number
  /** Task metrics per project id, for the "Tasks" figure on each card. */
  analytics: Record<string, ProjectAnalytics>
  role?: UserRole
  loading: boolean
  error: string | null
  errorStatus: number | null
  onRetry: () => void
  className?: string
}

export function ProjectOverview({
  projects,
  total,
  analytics,
  role,
  loading,
  error,
  errorStatus,
  onRetry,
  className,
}: ProjectOverviewProps) {
  const isAdmin = role === 'admin'

  return (
    <section className={className} aria-labelledby="project-overview-title">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 id="project-overview-title" className="text-base font-semibold tracking-tight text-ink">
            My projects
          </h2>
          <p className="text-xs text-ink-muted">Projects you own or are a member of</p>
        </div>
        {total > 0 && (
          <Link
            href="/dashboard/projects"
            className="inline-flex items-center gap-1 text-xs font-medium text-interactive transition-colors hover:text-interactive-hover"
          >
            {total > projects.length ? `View all ${total}` : 'View all'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {loading && projects.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading projects">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-64 rounded-card" />
          ))}
        </div>
      ) : error && projects.length === 0 ? (
        <ErrorState compact message={error} status={errorStatus} onRetry={onRetry} />
      ) : projects.length === 0 ? (
        <EmptyState
          compact
          icon={<FolderKanban className="h-6 w-6" />}
          title="No projects yet"
          action={
            isAdmin && (
              <ButtonLink href="/dashboard/projects/new" icon={<Plus className="h-4 w-4" />}>
                Create project
              </ButtonLink>
            )
          }
        >
          {isAdmin
            ? 'Create your first project to get started.'
            : "You'll see projects here once an admin staffs your team onto one."}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {projects.map((project, i) => (
            <ProjectCard
              key={project._id}
              project={project}
              taskCount={analytics[project._id]?.totalTasks}
              delay={i * 0.05}
            />
          ))}
        </div>
      )}
    </section>
  )
}
