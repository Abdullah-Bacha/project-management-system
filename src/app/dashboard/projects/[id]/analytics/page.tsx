'use client'

import clsx from 'clsx'
import { Timer, Gauge, Flame } from 'lucide-react'
import { useProject } from '@/features/projects/ProjectContext'
import { useProjectAnalytics } from '@/features/projects/useProjectAnalytics'
import { ProjectSummary } from '@/features/projects/ProjectSummary'
import { ErrorState } from '@/components/ui/PageState'

export default function AnalyticsPage() {
  const { project } = useProject()
  const { data: analytics, isLoading, error, errorStatus, refetch } = useProjectAnalytics(project._id)

  if (!analytics) {
    return isLoading ? (
      <div className="space-y-4">
        <div className="skeleton h-64 rounded-card" />
      </div>
    ) : (
      <ErrorState message={error} status={errorStatus} onRetry={refetch} />
    )
  }

  const byStatus = analytics.tasksByStatus
  const total = analytics.totalTasks || 0

  const statusRows = [
    { label: 'To Do', value: byStatus.todo ?? 0, bar: 'bg-ink-faint' },
    { label: 'In Progress', value: byStatus['in-progress'] ?? 0, bar: 'bg-brand-500' },
    { label: 'In Review', value: byStatus.review ?? 0, bar: 'bg-accent' },
    { label: 'Complete', value: byStatus.complete ?? 0, bar: 'bg-positive' },
  ]

  const hoursEfficiency =
    analytics.totalEstimatedHours > 0
      ? Math.round((analytics.totalActualHours / analytics.totalEstimatedHours) * 100)
      : 0

  return (
    <div className="space-y-8">
      <ProjectSummary analytics={analytics} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Highlight
          icon={<Gauge className="h-5 w-5" />}
          label="Completion Rate"
          value={`${analytics.completionRate}%`}
          caption={`${analytics.completedTasks} of ${total} tasks`}
          tone="text-positive-strong"
          chip="bg-positive-subtle text-positive-strong"
          delay={0.05}
        />
        <Highlight
          icon={<Timer className="h-5 w-5" />}
          label="Estimated Hours"
          value={`${analytics.totalEstimatedHours}h`}
          caption="Total project estimate"
          tone="text-brand-700"
          chip="bg-brand-50 text-brand-700"
          delay={0.1}
        />
        <Highlight
          icon={<Flame className="h-5 w-5" />}
          label="Actual Hours"
          value={`${analytics.totalActualHours}h`}
          caption="Time logged so far"
          tone="text-caution-strong"
          chip="bg-caution-subtle text-caution-strong"
          delay={0.15}
        />
      </div>

      <section className="mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
        <h2 className="font-semibold text-ink">Tasks by status</h2>

        <div className="mt-5 space-y-4">
          {statusRows.map((row) => (
            <Meter
              key={row.label}
              label={row.label}
              display={String(row.value)}
              percent={total > 0 ? (row.value / total) * 100 : 0}
              bar={row.bar}
            />
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
        <h2 className="font-semibold text-ink">Efficiency</h2>

        <div className="mt-5 space-y-4">
          <Meter
            label="High priority tasks"
            display={String(analytics.highPriorityTasks)}
            percent={total > 0 ? (analytics.highPriorityTasks / total) * 100 : 0}
            bar="bg-critical"
          />
          <Meter
            label="Completion progress"
            display={`${analytics.completionRate}%`}
            percent={analytics.completionRate}
            bar="bg-positive"
          />
          <Meter
            label="Hours vs estimate"
            display={`${hoursEfficiency}%`}
            percent={Math.min(hoursEfficiency, 100)}
            bar="bg-brand-500"
          />
        </div>
      </section>
    </div>
  )
}

function Highlight({
  icon,
  label,
  value,
  caption,
  tone,
  chip,
  delay,
}: {
  icon: React.ReactNode
  label: string
  value: string
  caption: string
  tone: string
  chip: string
  delay: number
}) {
  return (
    <div
      className="animate-rise rounded-card border border-hairline bg-surface p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lifted"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <span className={clsx('flex h-9 w-9 items-center justify-center rounded-xl', chip)}>
          {icon}
        </span>
      </div>
      <p className={clsx('mt-3 text-3xl font-semibold tracking-tight tabular-nums', tone)}>
        {value}
      </p>
      <p className="mt-1 text-sm text-ink-muted">{caption}</p>
    </div>
  )
}

function Meter({
  label,
  display,
  percent,
  bar,
}: {
  label: string
  display: string
  percent: number
  bar: string
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm text-ink-soft">{label}</span>
        <span className="text-sm font-semibold text-ink tabular-nums">{display}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={clsx('h-full rounded-full transition-all duration-700 ease-out', bar)}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
    </div>
  )
}
