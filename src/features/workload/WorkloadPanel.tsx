'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Eye, ListChecks, Users2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { Select } from '@/components/ui/Select'
import { StatsCard } from '@/components/ui/StatsCard'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { localToday } from '@/lib/due-date'
import { WORKLOAD_LABELS, WORKLOAD_THRESHOLDS, WORKLOAD_STATUSES, workloadRatio, type WorkloadStatus } from '@/lib/workload'
import type { DeveloperWorkload, WorkloadReport } from '@/types'
import { Panel } from '@/features/dashboard/Panel'

// Status is always written out as text; colour only reinforces it.
const BADGE: Record<WorkloadStatus, string> = {
  available: 'bg-info-subtle text-info-strong',
  normal: 'bg-positive-subtle text-positive-strong',
  high: 'bg-caution-subtle text-caution-strong',
  overloaded: 'bg-critical-subtle text-critical-strong',
}
const BAR: Record<WorkloadStatus, string> = {
  available: 'bg-info',
  normal: 'bg-positive',
  high: 'bg-caution',
  overloaded: 'bg-critical',
}

export function DeveloperCard({ dev, onOpen }: { dev: DeveloperWorkload; onOpen: () => void }) {
  const percent = dev.totalTasks > 0 ? Math.round((dev.completed / dev.totalTasks) * 100) : 0
  const fill = Math.round(workloadRatio(dev.activeTasks) * 100)

  // Only the summary is shown here; the full breakdown opens on click.
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View details for ${dev.name}`}
        className="flex w-full flex-col gap-3 rounded-xl border border-hairline p-4 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <div className="flex items-start gap-3">
          <Avatar name={dev.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">{dev.name}</p>
            <p className="text-xs text-ink-muted">
              {dev.totalTasks} {dev.totalTasks === 1 ? 'task' : 'tasks'} · {percent}% complete
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[dev.workloadStatus]}`}>
            {WORKLOAD_LABELS[dev.workloadStatus]}
          </span>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs text-ink-muted">
            <span>Active tasks</span>
            <span className="font-medium tabular-nums text-ink-soft">{dev.activeTasks}</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={Math.min(dev.activeTasks, WORKLOAD_THRESHOLDS.highMax)}
            aria-valuemin={0}
            aria-valuemax={WORKLOAD_THRESHOLDS.highMax}
            aria-label={`${dev.name}: ${dev.activeTasks} active tasks, ${WORKLOAD_LABELS[dev.workloadStatus]}`}
          >
            <div className={`h-full rounded-full transition-all duration-300 ${BAR[dev.workloadStatus]}`} style={{ width: `${fill}%` }} />
          </div>
        </div>
      </button>
    </li>
  )
}

/** One developer's full breakdown, shown only when their card is opened. */
export function DeveloperDetails({ dev, href, onClose }: { dev: DeveloperWorkload; href: string | null; onClose: () => void }) {
  const percent = dev.totalTasks > 0 ? Math.round((dev.completed / dev.totalTasks) * 100) : 0
  const fill = Math.round(workloadRatio(dev.activeTasks) * 100)

  return (
    <Modal title="Developer workload" placement="right" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        <div className="flex items-center gap-3">
          <Avatar name={dev.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-ink">{dev.name}</p>
            <p className="text-sm text-ink-muted">
              {dev.totalTasks} {dev.totalTasks === 1 ? 'task' : 'tasks'} · {percent}% complete
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[dev.workloadStatus]}`}>
            {WORKLOAD_LABELS[dev.workloadStatus]}
          </span>
        </div>

        <div>
          <div className="mb-1 flex justify-between text-xs text-ink-muted">
            <span>Active tasks</span>
            <span className="font-medium tabular-nums text-ink-soft">{dev.activeTasks}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
            <div className={`h-full rounded-full ${BAR[dev.workloadStatus]}`} style={{ width: `${fill}%` }} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['To Do', dev.todo],
            ['In Progress', dev.inProgress],
            ['In Review', dev.inReview],
            ['Completed', dev.completed],
            ['Overdue', dev.overdue],
            ['High / Urgent', `${dev.high} / ${dev.urgent}`],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-surface-sunken px-3.5 py-3">
              <dt className="text-xs text-ink-muted">{label}</dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {href && (
        <footer className="shrink-0 border-t border-hairline p-4">
          <Link href={href} className="inline-flex text-sm font-medium text-interactive transition-colors hover:text-interactive-hover">
            View tasks
          </Link>
        </footer>
      )}
    </Modal>
  )
}

type Metric = 'members' | 'active' | 'review' | 'overdue'

const METRICS: Record<Metric, { title: string; empty: string; value: (d: DeveloperWorkload) => number; unit: string }> = {
  members: { title: 'Team members', empty: 'No team members match these filters.', value: (d) => d.activeTasks, unit: 'active' },
  active: { title: 'Active tasks', empty: 'Nobody has active tasks right now.', value: (d) => d.activeTasks, unit: 'active' },
  review: { title: 'In review', empty: 'No task is waiting for review.', value: (d) => d.inReview, unit: 'in review' },
  overdue: { title: 'Overdue', empty: 'Nothing is overdue.', value: (d) => d.overdue, unit: 'overdue' },
}

/** The developers behind one summary number, with their share of it. Opening a row shows that developer's full breakdown. */
function MetricDetails({ metric, developers, onOpen, onClose }: { metric: Metric; developers: DeveloperWorkload[]; onOpen: (id: string) => void; onClose: () => void }) {
  const { title, empty, value, unit } = METRICS[metric]
  // Team members lists everyone; the other cards list only who contributes to the number.
  const rows = developers
    .filter((d) => metric === 'members' || value(d) > 0)
    .sort((a, b) => value(b) - value(a) || a.name.localeCompare(b.name))
  const total = developers.reduce((n, d) => n + (metric === 'members' ? 1 : value(d)), 0)

  return (
    <Modal title={title} placement="right" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <p className="mb-4 text-sm text-ink-muted">
          <span className="text-2xl font-semibold tabular-nums text-ink">{total}</span>{' '}
          {metric === 'members' ? (total === 1 ? 'team member' : 'team members') : `${unit} ${total === 1 ? 'task' : 'tasks'}`}
        </p>
        {rows.length === 0 ? (
          <p className="rounded-xl bg-surface-sunken px-4 py-6 text-center text-sm text-ink-muted">{empty}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((d) => (
              <li key={d._id}>
                <button
                  type="button"
                  onClick={() => onOpen(d._id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-hairline p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <Avatar name={d.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{d.name}</span>
                    <span className="block text-xs text-ink-muted">
                      {d.activeTasks} active · {d.inReview} in review · {d.overdue} overdue
                    </span>
                  </span>
                  {metric === 'members' ? (
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[d.workloadStatus]}`}>{WORKLOAD_LABELS[d.workloadStatus]}</span>
                  ) : (
                    <span className="shrink-0 text-lg font-semibold tabular-nums text-ink">{value(d)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}

function Skeleton() {
  return (
    <div className="space-y-4 p-5" aria-busy="true" aria-label="Loading team workload">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-sunken" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-44 animate-pulse rounded-xl bg-surface-sunken" />
        ))}
      </div>
    </div>
  )
}

/**
 * Who is carrying how much open work. For administrators and team leaders; the numbers come from /api/workload.
 * `summaryOnly` shows just the four summary cards (each opens its details), for a dashboard.
 */
export function WorkloadPanel({ summaryOnly = false }: { summaryOnly?: boolean } = {}) {
  const [teamId, setTeamId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [workload, setWorkload] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric | null>(null)

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ today: localToday() })
    if (teamId) params.set('teamId', teamId)
    if (projectId) params.set('projectId', projectId)
    if (workload) params.set('workload', workload)
    return `/api/workload?${params}`
  }, [teamId, projectId, workload])

  const { data, isLoading, error, errorStatus, refetch } = useRealtimeData<WorkloadReport>({
    endpoint,
    watch: ['tasks', 'projects', 'teams'],
  })

  // The project list follows the chosen team.
  const projects = (data?.projects ?? []).filter((p) => !teamId || p.teamId === teamId)

  const linkFor = (dev: DeveloperWorkload) => {
    const target = projectId || data?.projects.find((p) => p.teamId === dev.teamId)?._id
    return target ? `/dashboard/projects/${target}?developer=${dev._id}` : null
  }

  const filtered = Boolean(teamId || projectId || workload)
  const openDev = data?.developers.find((d) => d._id === openId)

  const summaryCards = data && (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatsCard label="Team members" value={data.summary.members} icon={<Users2 className="h-5 w-5" />} onClick={() => setMetric('members')} />
      <StatsCard label="Active tasks" value={data.summary.activeTasks} icon={<ListChecks className="h-5 w-5" />} onClick={() => setMetric('active')} />
      <StatsCard label="In review" value={data.summary.inReview} icon={<Eye className="h-5 w-5" />} onClick={() => setMetric('review')} />
      <StatsCard label="Overdue" tone={data.summary.overdue > 0 ? 'critical' : 'brand'} value={data.summary.overdue} icon={<AlertTriangle className="h-5 w-5" />} onClick={() => setMetric('overdue')} />
    </div>
  )

  const drawers = (
    <>
      {data && metric && !openDev && (
        <MetricDetails metric={metric} developers={data.developers} onOpen={(id) => setOpenId(id)} onClose={() => setMetric(null)} />
      )}
      {openDev && <DeveloperDetails dev={openDev} href={linkFor(openDev)} onClose={() => setOpenId(null)} />}
    </>
  )

  if (summaryOnly) {
    if (error && !data) return <ErrorState compact message="Unable to load team workload." status={errorStatus} onRetry={refetch} />
    if (!data) {
      return (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy="true" aria-label="Loading team summary">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 rounded-card" />
          ))}
        </div>
      )
    }
    return (
      <>
        {summaryCards}
        {drawers}
      </>
    )
  }

  return (
    <Panel title="Team workload">
      <div className="grid grid-cols-1 gap-3 border-b border-hairline p-5 sm:grid-cols-3">
        <Select
          label="Team"
          id="workload-team"
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value)
            setProjectId('')
          }}
        >
          <option value="">All teams</option>
          {data?.teams.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select label="Project" id="workload-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p._id} value={p._id}>
              {p.title}
            </option>
          ))}
        </Select>
        <Select label="Workload" id="workload-status" value={workload} onChange={(e) => setWorkload(e.target.value)}>
          <option value="">Any workload</option>
          {WORKLOAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {WORKLOAD_LABELS[s]}
            </option>
          ))}
        </Select>
      </div>

      {error && !data ? (
        <ErrorState compact message="Unable to load team workload." status={errorStatus} onRetry={refetch} />
      ) : isLoading && !data ? (
        <Skeleton />
      ) : data && data.developers.length === 0 ? (
        <EmptyState compact icon={<Users2 className="h-6 w-6" />} title="No workload data available">
          {filtered ? 'No team members match these filters.' : 'Assign tasks to team members to see workload here.'}
        </EmptyState>
      ) : data ? (
        <div className="space-y-4 p-5">
          {summaryCards}
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {data.developers.map((dev) => (
              <DeveloperCard key={dev._id} dev={dev} onOpen={() => setOpenId(dev._id)} />
            ))}
          </ul>
        </div>
      ) : null}

      {drawers}
    </Panel>
  )
}
