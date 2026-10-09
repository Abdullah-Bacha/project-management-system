'use client'

import Link from 'next/link'
import clsx from 'clsx'
import { ArrowRight, CalendarDays, ListChecks, Pencil, UsersRound } from 'lucide-react'
import { ProjectStatusBadge } from '@/components/ui/StatusBadge'
import type { Project } from '@/types'

interface ProjectCardProps {
  project: Project
  /** Total tasks in the project, when the page has it (the dashboard does). */
  taskCount?: number
  delay?: number
  /** Shown for the admin who owns the project: opens the edit form. */
  onEdit?: () => void
}

/** A project at a glance: status, progress, size, deadline, who runs it — and one obvious action. */
export function ProjectCard({ project, taskCount, delay = 0, onEdit }: ProjectCardProps) {
  const progress = project.progress ?? 0
  const isDone = project.status === 'completed' || progress === 100
  const memberCount = project.members?.length ?? 0

  const deadline = project.deadline ? new Date(project.deadline) : null
  const overdue = Boolean(deadline && !isDone && project.status === 'active' && deadline.getTime() < Date.now())

  const runBy = project.team
    ? `${project.team.name}${project.team.teamLeader ? ` · led by ${project.team.teamLeader.name}` : ''}`
    : `No team assigned${project.owner ? ` · Owner: ${project.owner.name}` : ''}`

  return (
    <div className="animate-rise relative h-full" style={{ animationDelay: `${delay}s` }}>
    <Link href={`/dashboard/projects/${project._id}`} className="group block h-full rounded-card outline-offset-2">
      <article
        className={clsx(
          'flex h-full flex-col rounded-card border border-hairline bg-surface p-5',
          'shadow-card transition-all duration-200 ease-out',
          'group-hover:-translate-y-0.5 group-hover:border-brand-200 group-hover:shadow-lifted'
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className={clsx('line-clamp-1 font-semibold text-ink transition-colors group-hover:text-brand-700', onEdit && 'pr-8')}>
            {project.title}
          </h3>
          <ProjectStatusBadge status={project.status} className="shrink-0" />
        </div>

        <p className="mt-1.5 line-clamp-2 min-h-10 text-sm text-ink-muted">
          {project.description || 'No description yet.'}
        </p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-xs font-medium text-ink-muted">Progress</span>
            <span className="text-xs font-semibold text-ink tabular-nums">{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label={`${project.title} progress`}
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
          >
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500 ease-out',
                isDone ? 'bg-positive' : 'bg-gradient-to-r from-brand-500 to-accent'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <dl className={clsx('mt-4 grid gap-2 border-t border-hairline pt-4 text-xs', taskCount === undefined ? 'grid-cols-2' : 'grid-cols-3')}>
          {taskCount !== undefined && (
            <Stat icon={<ListChecks className="h-3.5 w-3.5" />} label="Tasks" value={taskCount} />
          )}
          <Stat icon={<UsersRound className="h-3.5 w-3.5" />} label="Members" value={memberCount} />
          <Stat
            icon={<CalendarDays className="h-3.5 w-3.5" />}
            label={overdue ? 'Overdue' : 'Due'}
            tone={overdue ? 'critical' : undefined}
            value={
              deadline
                ? deadline.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                : 'No date'
            }
          />
        </dl>

        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <p
            className={clsx('min-w-0 truncate text-xs', project.team ? 'text-ink-faint' : 'font-medium text-caution-strong')}
            title={runBy}
          >
            {runBy}
          </p>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-interactive transition-colors group-hover:text-interactive-hover">
            Open project
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
        </div>
      </article>
    </Link>
    {onEdit && (
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${project.title}`}
        title="Edit project"
        className="absolute right-3 top-12 z-10 rounded-lg border border-hairline bg-surface p-1.5 text-ink-muted shadow-sm transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    )}
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  tone?: 'critical'
}) {
  return (
    <div className="min-w-0">
      <dt className={clsx('flex items-center gap-1.5', tone === 'critical' ? 'text-critical-strong' : 'text-ink-faint')}>
        {icon}
        {label}
      </dt>
      <dd
        className={clsx(
          'mt-1 truncate text-sm font-semibold tabular-nums',
          tone === 'critical' ? 'text-critical-strong' : 'text-ink'
        )}
      >
        {value}
      </dd>
    </div>
  )
}
