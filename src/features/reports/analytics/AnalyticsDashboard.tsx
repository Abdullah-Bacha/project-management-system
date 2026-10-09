'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Eye,
  FolderKanban,
  Link2Off,
  ListChecks,
  Percent,
  Search,
  Users2,
  RotateCcw,
} from 'lucide-react'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { PriorityBadge } from '@/components/ui/StatusBadge'
import { Select } from '@/components/ui/Select'
import { StatsCard } from '@/components/ui/StatsCard'
import { TaskStatusBadge } from '@/components/ui/StatusBadge'
import { Button } from '@/components/ui/Button'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { addDays } from '@/lib/analytics'
import { formatDueDate, isValidDateOnly, localToday } from '@/lib/due-date'
import { TASK_STATUS_LABELS } from '@/lib/task-status'
import { WORKLOAD_LABELS, WORKLOAD_STATUSES, WORKLOAD_THRESHOLDS } from '@/lib/workload'
import { OVERDUE_AGES, TASK_PRIORITIES, TASK_STATUSES, type AnalyticsReport, type TaskPriority } from '@/types'
import { DeveloperCard, DeveloperDetails } from '@/features/workload/WorkloadPanel'
import { BarList, DonutChart, TrendChart, type Slice } from './charts'
import { OverviewCards } from './OverviewCards'

// ------------------------------------------------------------ presentation

const STATUS_STYLE: Record<(typeof TASK_STATUSES)[number], { color: string; swatch: string }> = {
  todo: { color: 'text-ink-faint', swatch: 'bg-ink-faint' },
  'in-progress': { color: 'text-brand-500', swatch: 'bg-brand-500' },
  review: { color: 'text-accent', swatch: 'bg-accent' },
  complete: { color: 'text-positive', swatch: 'bg-positive' },
}

const PRIORITY_SWATCH: Record<TaskPriority, string> = {
  low: 'bg-ink-faint',
  medium: 'bg-brand-500',
  high: 'bg-caution',
  urgent: 'bg-critical',
}
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }

const AGE_LABEL = { '1-3': '1–3 days overdue', '4-7': '4–7 days overdue', '8+': 'More than 7 days overdue' } as const

const WORKLOAD_BADGE = {
  available: 'bg-info-subtle text-info-strong',
  normal: 'bg-positive-subtle text-positive-strong',
  high: 'bg-caution-subtle text-caution-strong',
  overloaded: 'bg-critical-subtle text-critical-strong',
} as const

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'projects', label: 'Project performance' },
  { id: 'tasks', label: 'Task analytics' },
  { id: 'teams', label: 'Team performance' },
  { id: 'overdue', label: 'Overdue analysis' },
  { id: 'bottlenecks', label: 'Workload & bottlenecks' },
] as const
type SectionId = (typeof SECTIONS)[number]['id']

const PRESETS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
] as const

const fmtRange = (from: string, to: string) => `${formatDueDate(from)} – ${formatDueDate(to)}`

// ------------------------------------------------------------------ pieces

function Card({ title, subtitle, children, className }: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-card border border-hairline bg-surface p-5 shadow-card ${className ?? ''}`}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

function NoData({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-surface-sunken px-4 py-6 text-center text-sm text-ink-muted">{children}</p>
}

/** A table that scrolls inside its card on narrow screens instead of widening the page. */
function DataTable({ caption, head, children }: { caption: string; head: string[]; children: React.ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-hairline text-xs text-ink-muted">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`py-2 pr-3 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">{children}</tbody>
      </table>
    </div>
  )
}

const num = 'py-2.5 pr-3 text-right tabular-nums text-ink-soft'

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading analytics">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-28 rounded-card" />
        ))}
      </div>
      <div className="skeleton h-64 rounded-card" />
    </div>
  )
}

// ------------------------------------------------------------------- main

/**
 * Reports & Analytics. The server does all the counting (/api/analytics, one
 * grouped query per kind of number); this only filters and presents. Numbers
 * about "right now" (status, overdue, blocked, projects, teams) ignore the date
 * range, and say so; the range drives the period activity and the trends.
 */
export function AnalyticsDashboard() {
  const [section, setSection] = useState<SectionId>('overview')
  const [preset, setPreset] = useState<string>('30')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [teamId, setTeamId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const today = localToday()
  // The viewer's own zone, so "which day" matches their calendar (and the "today" they send).
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', [])
  const range = useMemo(() => {
    if (preset === 'custom') return { from: customFrom, to: customTo }
    return { from: addDays(today, -(Number(preset) - 1)), to: today }
  }, [preset, customFrom, customTo, today])

  const customError =
    preset !== 'custom'
      ? null
      : !range.from || !range.to
        ? 'Choose a start and an end date.'
        : !isValidDateOnly(range.from) || !isValidDateOnly(range.to)
          ? 'Enter valid dates.'
          : range.from > range.to
            ? 'The start date must not be after the end date.'
            : null

  const endpoint = useMemo(() => {
    const params = new URLSearchParams({ today, from: range.from, to: range.to, timeZone })
    if (teamId) params.set('teamId', teamId)
    if (projectId) params.set('projectId', projectId)
    return `/api/analytics?${params}`
  }, [today, timeZone, range.from, range.to, teamId, projectId])

  const { data, isLoading, error, errorStatus, refetch } = useRealtimeData<AnalyticsReport>({
    endpoint,
    // Task, project and roster changes already push signals; so do dependency changes.
    watch: ['tasks', 'projects', 'teams', 'taskdependencies'],
    enabled: !customError,
  })

  const projectOptions = (data?.options.projects ?? []).filter((p) => !teamId || p.teamId === teamId)
  const filtered = Boolean(teamId || projectId || preset !== '30')
  const reset = () => {
    setPreset('30')
    setCustomFrom('')
    setCustomTo('')
    setTeamId('')
    setProjectId('')
    setProjectQuery('')
  }

  const onTabKey = (e: React.KeyboardEvent, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (e.key === 'Home' || e.key === 'End' || delta) {
      e.preventDefault()
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? SECTIONS.length - 1 : (index + delta + SECTIONS.length) % SECTIONS.length
      setSection(SECTIONS[next].id)
      tabRefs.current[SECTIONS[next].id]?.focus()
    }
  }

  return (
    <section aria-labelledby="analytics-heading">
      <h2 id="analytics-heading" className="text-lg font-semibold tracking-tight text-ink">
        Analytics
      </h2>
      <p className="mt-0.5 text-sm text-ink-muted">Live numbers from your projects. Current-state figures ignore the date range; period figures use it.</p>

      {/* Filters */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="mt-4 grid grid-cols-1 gap-3 rounded-card border border-hairline bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Analytics filters"
      >
        <Select label="Period" id="analytics-period" value={preset} onChange={(e) => setPreset(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <Select
          label="Team"
          id="analytics-team"
          value={teamId}
          onChange={(e) => {
            setTeamId(e.target.value)
            setProjectId('')
          }}
        >
          <option value="">All teams</option>
          {data?.options.teams.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Select label="Project" id="analytics-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">All projects</option>
          {projectOptions.map((p) => (
            <option key={p._id} value={p._id}>
              {p.title}
            </option>
          ))}
        </Select>
        <div className="flex items-end">
          <Button type="button" variant="secondary" fullWidth icon={<RotateCcw className="h-4 w-4" />} onClick={reset} disabled={!filtered && !projectQuery}>
            Reset filters
          </Button>
        </div>

        {preset === 'custom' && (
          <>
            <div>
              <label htmlFor="analytics-from" className="mb-1.5 block text-sm font-medium text-ink-soft">
                From
              </label>
              <input
                id="analytics-from"
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-focus focus:outline-none focus:ring-4 focus:ring-focus/12"
              />
            </div>
            <div>
              <label htmlFor="analytics-to" className="mb-1.5 block text-sm font-medium text-ink-soft">
                To
              </label>
              <input
                id="analytics-to"
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink focus:border-focus focus:outline-none focus:ring-4 focus:ring-focus/12"
              />
            </div>
            {customError && (
              <p role="alert" className="self-end text-sm text-critical-strong sm:col-span-2">
                {customError}
              </p>
            )}
          </>
        )}
      </form>

      {/* Section switcher */}
      <div role="tablist" aria-label="Analytics sections" className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-hairline bg-surface p-1">
        {SECTIONS.map((s, i) => (
          <button
            key={s.id}
            ref={(el) => {
              tabRefs.current[s.id] = el
            }}
            role="tab"
            id={`analytics-tab-${s.id}`}
            aria-selected={section === s.id}
            aria-controls="analytics-panel"
            tabIndex={section === s.id ? 0 : -1}
            onClick={() => setSection(s.id)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              section === s.id ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div id="analytics-panel" role="tabpanel" aria-labelledby={`analytics-tab-${section}`} className="mt-4">
        {customError ? (
          <EmptyState compact icon={<BarChart3 className="h-6 w-6" />} title="Choose a date range">
            {customError}
          </EmptyState>
        ) : error && !data ? (
          <ErrorState compact message="Unable to load analytics." status={errorStatus} onRetry={refetch} />
        ) : isLoading && !data ? (
          <Skeleton />
        ) : data ? (
          data.options.projects.length === 0 ? (
            <EmptyState compact icon={<FolderKanban className="h-6 w-6" />} title="No projects to analyse yet">
              Analytics appear once there are projects you manage.
            </EmptyState>
          ) : (
            <Sections data={data} section={section} projectQuery={projectQuery} setProjectQuery={setProjectQuery} />
          )
        ) : null}
      </div>
    </section>
  )
}

// --------------------------------------------------------------- sections

function Sections({ data, section, projectQuery, setProjectQuery }: { data: AnalyticsReport; section: SectionId; projectQuery: string; setProjectQuery: (q: string) => void }) {
  const [devId, setDevId] = useState<string | null>(null)
  const o = data.overview
  const period = fmtRange(data.range.from, data.range.to)
  const openDev = data.developers.find((d) => d._id === devId)
  const linkFor = (d: { _id: string; teamId: string }) => {
    const project = data.options.projects.find((x) => x.teamId === d.teamId)
    return project ? `/dashboard/projects/${project._id}?developer=${d._id}` : null
  }

  const statusSlices: Slice[] = TASK_STATUSES.map((s) => ({
    key: s,
    label: TASK_STATUS_LABELS[s],
    value: data.status[s],
    ...STATUS_STYLE[s],
  }))

  if (section === 'overview') return <OverviewCards data={data} />

  if (section === 'projects') {
    const q = projectQuery.trim().toLowerCase()
    const rows = data.projects.filter((p) => !q || p.title.toLowerCase().includes(q))
    return (
      <Card title="Project performance" subtitle="Current state of each project's tasks (not date-filtered). Completion = completed ÷ total tasks, the same as a project's progress.">
        <div className="relative mb-4 max-w-sm">
          <label htmlFor="analytics-project-search" className="sr-only">
            Filter projects by name
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            id="analytics-project-search"
            value={projectQuery}
            onChange={(e) => setProjectQuery(e.target.value)}
            placeholder="Filter projects…"
            className="h-10 w-full rounded-xl border border-hairline bg-surface pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-focus focus:outline-none focus:ring-4 focus:ring-focus/12"
          />
        </div>
        {data.projects.length === 0 ? (
          <NoData>No projects match the selected team.</NoData>
        ) : rows.length === 0 ? (
          <NoData>No projects match “{projectQuery}”.</NoData>
        ) : (
          <DataTable caption="Project performance" head={['Project', 'Tasks', 'Completed', 'Active', 'In review', 'Overdue', 'Blocked', 'Completion']}>
            {rows.map((p) => (
              <tr key={p._id}>
                <th scope="row" className="max-w-[14rem] py-2.5 pr-3 text-left font-medium">
                  <Link href={`/dashboard/projects/${p._id}`} className="block truncate text-ink hover:text-interactive">
                    {p.title}
                  </Link>
                </th>
                <td className={num}>{p.total}</td>
                <td className={num}>{p.completed}</td>
                <td className={num}>{p.active}</td>
                <td className={num}>{p.inReview}</td>
                <td className={`${num} ${p.overdue > 0 ? '!text-critical-strong' : ''}`}>{p.overdue}</td>
                <td className={num}>{p.blocked}</td>
                <td className="py-2.5 pr-3">
                  <div className="ml-auto flex w-28 items-center justify-end gap-2">
                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                      <div className="h-full rounded-full bg-positive" style={{ width: `${p.completionRate}%` }} />
                    </div>
                    <span className="w-9 text-right tabular-nums text-ink">{p.completionRate}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>
    )
  }

  if (section === 'tasks') {
    const completedSeries = [{ key: 'completed' as const, label: 'Completed', color: 'text-positive', swatch: 'bg-positive' }]
    const bothSeries = [
      { key: 'created' as const, label: 'Created', color: 'text-brand-500', swatch: 'bg-brand-500' },
      { key: 'completed' as const, label: 'Completed', color: 'text-positive', swatch: 'bg-positive' },
    ]
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Task status distribution" subtitle="Current state of all tasks in scope">
          {o.tasks === 0 ? <NoData>No tasks yet.</NoData> : <DonutChart slices={statusSlices} label="Task status distribution" />}
        </Card>
        <Card title="Task priority distribution" subtitle="Current state of all tasks in scope">
          {o.tasks === 0 ? (
            <NoData>No tasks yet.</NoData>
          ) : (
            <BarList label="Tasks by priority" rows={TASK_PRIORITIES.map((p) => ({ key: p, label: PRIORITY_LABEL[p], value: data.priority[p], swatch: PRIORITY_SWATCH[p] }))} />
          )}
        </Card>
        <Card title="Task completion trend" subtitle={`Tasks completed, ${period}`} className="lg:col-span-2">
          {o.completedInPeriod === 0 ? (
            <NoData>No tasks were completed in this period.</NoData>
          ) : (
            <TrendChart points={data.trend.points} series={completedSeries} granularity={data.trend.granularity} timeZone={data.range.timeZone} label={`Tasks completed per ${data.trend.granularity}, ${period}`} />
          )}
          {data.trend.completedWithoutTimestamp > 0 && (
            <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
              {data.trend.completedWithoutTimestamp} completed {data.trend.completedWithoutTimestamp === 1 ? 'task has' : 'tasks have'} no completion date (finished before dates were recorded), so{' '}
              {data.trend.completedWithoutTimestamp === 1 ? 'it is' : 'they are'} not in this trend.
            </p>
          )}
        </Card>
        <Card title="Created vs completed" subtitle={`Within ${period}`} className="lg:col-span-2">
          {o.createdInPeriod === 0 && o.completedInPeriod === 0 ? (
            <NoData>No tasks were created or completed in this period.</NoData>
          ) : (
            <TrendChart points={data.trend.points} series={bothSeries} granularity={data.trend.granularity} timeZone={data.range.timeZone} label={`Tasks created and completed per ${data.trend.granularity}, ${period}`} />
          )}
          <p className="mt-3 text-xs text-ink-muted">
            Counts events inside the period only. A task created earlier but finished now counts as completed here, so created minus completed is not the amount of outstanding work.
          </p>
        </Card>
      </div>
    )
  }

  if (section === 'teams') {
    return (
      <div className="space-y-4">
      <Card
        title="Team performance"
        subtitle={`Open work carried by each team's roster, from the same counts as Team Workload (${WORKLOAD_LABELS.normal}: 1–${WORKLOAD_THRESHOLDS.normalMax} active, ${WORKLOAD_LABELS.high}: up to ${WORKLOAD_THRESHOLDS.highMax}, ${WORKLOAD_LABELS.overloaded}: more). These are workload signals, not productivity scores.`}
      >
        {data.teams.length === 0 ? (
          <NoData>No teams in this scope.</NoData>
        ) : (
          <DataTable caption="Team performance" head={['Team', 'Developers', 'Active', 'In review', 'Completed', 'Overdue', 'Blocked', 'Workload (developers)']}>
            {data.teams.map((t) => (
              <tr key={t._id}>
                <th scope="row" className="max-w-[12rem] truncate py-2.5 pr-3 text-left font-medium text-ink">
                  {t.name}
                </th>
                <td className={num}>{t.developers}</td>
                <td className={num}>{t.activeTasks}</td>
                <td className={num}>{t.inReview}</td>
                <td className={num}>{t.completed}</td>
                <td className={`${num} ${t.overdue > 0 ? '!text-critical-strong' : ''}`}>{t.overdue}</td>
                <td className={num}>{t.blocked}</td>
                <td className="py-2.5 pr-3">
                  <div className="flex flex-wrap justify-end gap-1">
                    {t.developers === 0 ? (
                      <span className="text-xs text-ink-muted">No members</span>
                    ) : (
                      WORKLOAD_STATUSES.filter((s) => t.workload[s] > 0).map((s) => (
                        <span key={s} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${WORKLOAD_BADGE[s]}`}>
                          {t.workload[s]} {WORKLOAD_LABELS[s]}
                        </span>
                      ))
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
        <p className="mt-3 text-xs text-ink-muted">Membership comes from each team&apos;s roster. Blocked counts open tasks assigned to roster members.</p>
      </Card>

      <Card title="Who is carrying what" subtitle="Open work per team member, from the same counts as Team Workload. Click a person for the breakdown. These are capacity signals, not performance scores.">
        {data.developers.length === 0 ? (
          <NoData>No team members in this scope.</NoData>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {data.developers.map((d) => (
              <DeveloperCard key={d._id} dev={d} onOpen={() => setDevId(d._id)} />
            ))}
          </ul>
        )}
      </Card>

      {openDev && <DeveloperDetails dev={openDev} href={linkFor(openDev)} onClose={() => setDevId(null)} />}
      </div>
    )
  }

  if (section === 'overdue') {
    const ov = data.overdue
    return (
      <div className="space-y-4">
        {ov.total === 0 ? (
          <EmptyState compact icon={<CheckCircle2 className="h-6 w-6" />} title="Nothing is overdue">
            No active task is past its due day. Tasks due today are not overdue.
          </EmptyState>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card title="Overdue by project" subtitle={`${ov.total} overdue active ${ov.total === 1 ? 'task' : 'tasks'}`}>
                <BarList label="Overdue tasks by project" rows={ov.byProject.map((p) => ({ key: p._id, label: p.title, value: p.count, swatch: 'bg-critical' }))} />
              </Card>
              <Card title="Overdue by priority">
                <BarList label="Overdue tasks by priority" rows={TASK_PRIORITIES.map((p) => ({ key: p, label: PRIORITY_LABEL[p], value: ov.byPriority[p], swatch: PRIORITY_SWATCH[p] }))} />
              </Card>
              <Card title="How long overdue">
                <BarList label="Overdue tasks by age" rows={OVERDUE_AGES.map((a) => ({ key: a, label: AGE_LABEL[a], value: ov.byAge[a], swatch: 'bg-critical' }))} />
              </Card>
            </div>
            <Card title="Overdue tasks" subtitle={ov.total > ov.tasks.length ? `The ${ov.tasks.length} longest overdue of ${ov.total}` : undefined}>
              <DataTable caption="Overdue tasks" head={['Task', 'Project', 'Priority', 'Due', 'Assignee']}>
                {ov.tasks.map((t) => (
                  <tr key={t._id}>
                    <th scope="row" className="max-w-[16rem] truncate py-2.5 pr-3 text-left font-medium text-ink">
                      {t.title}
                    </th>
                    <td className="py-2.5 pr-3 text-right text-ink-soft">
                      <Link href={`/dashboard/projects/${t.projectId}`} className="hover:text-interactive">
                        {t.projectTitle}
                      </Link>
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right text-critical-strong">{formatDueDate(t.dueDate)}</td>
                    <td className="py-2.5 pr-3 text-right text-ink-soft">{t.assignee ?? 'Unassigned'}</td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </>
        )}
      </div>
    )
  }

  // bottlenecks
  const b = data.blocked
  const workloadTotals = WORKLOAD_STATUSES.map((s) => ({ s, n: data.teams.reduce((n, t) => n + t.workload[s], 0) }))
  const developers = workloadTotals.reduce((n, w) => n + w.n, 0)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Workload bands" subtitle="Developers by how much open work they carry (the Team Workload bands)">
          {developers === 0 ? (
            <NoData>No team members in this scope.</NoData>
          ) : (
            <BarList
              label="Developers by workload band"
              unit="developers"
              rows={workloadTotals.map(({ s, n }) => ({
                key: s,
                label: WORKLOAD_LABELS[s],
                value: n,
                swatch: s === 'overloaded' ? 'bg-critical' : s === 'high' ? 'bg-caution' : s === 'normal' ? 'bg-positive' : 'bg-info',
              }))}
            />
          )}
        </Card>
        <Card title="Blocked tasks" subtitle="Active tasks waiting on a task that is not Complete (each counted once)">
          {b.total === 0 ? (
            <NoData>No task is blocked by an unfinished prerequisite.</NoData>
          ) : (
            <div className="space-y-5">
              <BarList label="Blocked tasks by project" rows={b.byProject.map((p) => ({ key: p._id, label: p.title, value: p.count, swatch: 'bg-caution' }))} />
              <div>
                <p className="mb-2 text-xs font-medium text-ink-muted">By priority</p>
                <BarList label="Blocked tasks by priority" rows={TASK_PRIORITIES.map((p) => ({ key: p, label: PRIORITY_LABEL[p], value: b.byPriority[p], swatch: PRIORITY_SWATCH[p] }))} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {b.top.length > 0 && (
        <Card title="Waiting on the most prerequisites" subtitle="A task stays blocked until every prerequisite is Complete. Statuses are never changed automatically.">
          <ul className="divide-y divide-hairline">
            {b.top.map((t) => (
              <li key={t._id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 truncate text-sm font-medium text-ink">{t.title}</span>
                  <PriorityBadge priority={t.priority} />
                  <span className="text-xs text-ink-muted">
                    in{' '}
                    <Link href={`/dashboard/projects/${t.projectId}`} className="hover:text-interactive">
                      {t.projectTitle}
                    </Link>
                  </span>
                  <span className="ml-auto text-xs font-medium text-caution-strong">
                    Waiting on {t.openBlockers} unfinished {t.openBlockers === 1 ? 'task' : 'tasks'}
                  </span>
                </div>
                {t.waitingOn.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {t.waitingOn.map((w) => (
                      <li key={w._id} className="flex items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 py-1 text-xs text-ink-soft">
                        {w.title}
                        <TaskStatusBadge status={w.status} />
                      </li>
                    ))}
                    {t.openBlockers > t.waitingOn.length && <li className="px-1 py-1 text-xs text-ink-muted">+{t.openBlockers - t.waitingOn.length} more</li>}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
