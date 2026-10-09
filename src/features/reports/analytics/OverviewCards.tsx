'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, FolderKanban, Link2Off, ListChecks, Percent } from 'lucide-react'
import { StatsCard } from '@/components/ui/StatsCard'
import { formatDueDate } from '@/lib/due-date'
import type { AnalyticsReport } from '@/types'
import { KpiDetails, type Kpi } from './KpiDetails'

/**
 * The analytics overview: eight cards for the current state of the tasks in
 * scope, and the period's created / completed. Each card opens its details.
 * Used by the Reports page and the team leader's dashboard.
 */
export function OverviewCards({ data }: { data: AnalyticsReport }) {
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const o = data.overview
  const period = `${formatDueDate(data.range.from)} – ${formatDueDate(data.range.to)}`

  return (
    <div className="space-y-4">
      {kpi && <KpiDetails kpi={kpi} data={data} onClose={() => setKpi(null)} />}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatsCard label="Projects" value={o.projects} icon={<FolderKanban className="h-5 w-5" />} hint="In the selected scope" onClick={() => setKpi('projects')} />
        <StatsCard label="Total tasks" value={o.tasks} icon={<ListChecks className="h-5 w-5" />} hint="All time" onClick={() => setKpi('tasks')} />
        <StatsCard label="Completed" value={o.completed} tone="positive" icon={<CheckCircle2 className="h-5 w-5" />} hint="Status: Complete" onClick={() => setKpi('completed')} />
        <StatsCard label="Active" value={o.active} icon={<ListChecks className="h-5 w-5" />} hint="To Do + In Progress + In Review" onClick={() => setKpi('active')} />
        <StatsCard label="Awaiting review" value={o.inReview} tone="caution" icon={<Eye className="h-5 w-5" />} hint="Status: In Review" onClick={() => setKpi('review')} />
        <StatsCard label="Overdue" value={o.overdue} tone={o.overdue > 0 ? 'critical' : 'brand'} icon={<AlertTriangle className="h-5 w-5" />} hint="Active tasks past their due day" onClick={() => setKpi('overdue')} />
        <StatsCard label="Completion rate" value={`${o.completionRate}%`} tone="positive" icon={<Percent className="h-5 w-5" />} hint={`${o.completed} of ${o.tasks} tasks`} onClick={() => setKpi('rate')} />
        <StatsCard label="Blocked" value={o.blocked} tone={o.blocked > 0 ? 'caution' : 'brand'} icon={<Link2Off className="h-5 w-5" />} hint="Waiting on an unfinished task" onClick={() => setKpi('blocked')} />
      </div>

      <section className="rounded-card border border-hairline bg-surface p-5 shadow-card">
        <h3 className="text-sm font-semibold text-ink">In the selected period</h3>
        <p className="mt-0.5 text-xs text-ink-muted">{period}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-ink-muted">Tasks created</dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{o.createdInPeriod}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Tasks completed</dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">{o.completedInPeriod}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-ink-muted">
          The cards above show the current state of every task in scope. The two numbers here count only what happened inside the period.
        </p>
      </section>
    </div>
  )
}
