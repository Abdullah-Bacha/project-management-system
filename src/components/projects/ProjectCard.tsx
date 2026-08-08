'use client'

import Link from 'next/link'
import clsx from 'clsx'
import { Users, ArrowUpRight, CalendarDays } from 'lucide-react'
import { Project } from '@/types'

interface ProjectCardProps {
  project: Project
  delay?: number
}

export function ProjectCard({ project, delay = 0 }: ProjectCardProps) {
  const memberCount = project.members?.length ?? 0
  const progress = project.progress ?? 0
  const isDone = progress === 100

  return (
    <Link
      href={`/dashboard/projects/${project._id}`}
      className="animate-rise group block h-full"
      style={{ animationDelay: `${delay}s` }}
    >
      <article
        className={clsx(
          'flex h-full flex-col overflow-hidden rounded-card border border-hairline bg-surface',
          'shadow-card transition-all duration-300 ease-out',
          'hover:-translate-y-1 hover:border-brand-200 hover:shadow-lifted'
        )}
      >
        {/* Accent rail fills with the project's progress */}
        <div className="h-1 w-full bg-hairline">
          <div
            className={clsx(
              'h-full transition-all duration-500 ease-out',
              isDone
                ? 'bg-positive'
                : 'bg-gradient-to-r from-brand-500 to-accent'
            )}
            style={{ width: `${Math.max(progress, 2)}%` }}
          />
        </div>

        <div className="flex flex-1 flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="line-clamp-1 font-semibold text-ink transition-colors group-hover:text-brand-700">
              {project.title}
            </h3>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-faint opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
          </div>

          <p className="mt-1.5 line-clamp-2 min-h-10 text-sm text-ink-muted">
            {project.description || 'No description yet.'}
          </p>

          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-xs font-medium text-ink-muted">Progress</span>
              <span className="text-xs font-semibold text-ink tabular-nums">
                {progress}%
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className={clsx(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  isDone ? 'bg-positive' : 'bg-gradient-to-r from-brand-500 to-accent'
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 pt-5">
            <div className="flex items-center gap-3 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {memberCount}
              </span>
              {project.deadline && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {new Date(project.deadline).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>

            <span
              className={clsx(
                'rounded-full px-2.5 py-1 text-[11px] font-medium capitalize',
                project.status === 'active'
                  ? 'bg-positive/10 text-positive'
                  : 'bg-surface-sunken text-ink-muted'
              )}
            >
              {project.status}
            </span>
          </div>
        </div>
      </article>
    </Link>
  )
}
