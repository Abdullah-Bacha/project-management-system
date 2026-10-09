'use client'

import {
  ListChecks,
  CheckCircle2,
  Target,
  AlertTriangle,
  Users,
  CalendarDays,
  Crown,
  UsersRound,
  ClipboardList,
} from 'lucide-react'
import { useProject } from '@/features/projects/ProjectContext'
import { ReportSection } from '@/features/reports/ReportSection'
import { StatsCard } from '@/components/ui/StatsCard'
import type { ProjectAnalytics } from '@/types'

/** Project-level numbers, staffing and the progress report (formerly the Overview tab). */
export function ProjectSummary({ analytics }: { analytics: ProjectAnalytics }) {
  const { project, can } = useProject()

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Total Tasks"
          value={analytics.totalTasks}
          icon={<ListChecks className="h-5 w-5" />}
          tone="brand"
          delay={0.05}
        />
        <StatsCard
          label="Completed"
          value={analytics.completedTasks}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="positive"
          delay={0.1}
        />
        <StatsCard
          label="Completion Rate"
          value={`${analytics.completionRate}%`}
          icon={<Target className="h-5 w-5" />}
          tone="caution"
          delay={0.15}
        />
        <StatsCard
          label="Overdue"
          value={analytics.overdueTasks}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="critical"
          delay={0.2}
        />
      </div>

      <section className="mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
        <h2 className="font-semibold text-ink">Project status</h2>

        <div className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-ink-muted">Overall progress</span>
            <span className="text-sm font-semibold text-ink tabular-nums">{project.progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent transition-all duration-700 ease-out"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-hairline pt-5 sm:grid-cols-3">
          <Detail icon={<Target className="h-4 w-4" />} label="Status" value={project.status} />
          <Detail
            icon={<Users className="h-4 w-4" />}
            label="Members"
            value={String(project.members?.length ?? 0)}
          />
          <Detail
            icon={<CalendarDays className="h-4 w-4" />}
            label="Created"
            value={new Date(project.createdAt).toLocaleDateString()}
          />
        </dl>
      </section>

      {(project.team || project.requirements) && (
        <section className="mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
          <h2 className="font-semibold text-ink">Staffing &amp; requirements</h2>

          {project.team && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Detail
                icon={<Crown className="h-4 w-4" />}
                label="Team leader"
                value={project.team.teamLeader?.name ?? 'Unassigned'}
              />
              <Detail
                icon={<UsersRound className="h-4 w-4" />}
                label="Team"
                value={project.team.name}
              />
            </div>
          )}

          {project.requirements && (
            <div className="mt-5 border-t border-hairline pt-5">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <ClipboardList className="h-3.5 w-3.5" />
                Requirements
              </p>
              <p className="whitespace-pre-line text-sm text-ink-soft">{project.requirements}</p>
            </div>
          )}
        </section>
      )}

      {project.team && (
        <ReportSection projectId={project._id} analytics={analytics} canSend={can.canEdit} />
      )}

    </div>
  )
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
        {icon}
      </span>
      <div>
        <dt className="text-xs text-ink-muted">{label}</dt>
        <dd className="text-sm font-medium capitalize text-ink">{value}</dd>
      </div>
    </div>
  )
}
