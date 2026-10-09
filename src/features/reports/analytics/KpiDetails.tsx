'use client'

import Link from 'next/link'
import { Modal } from '@/components/ui/Modal'
import { PriorityBadge, TaskStatusBadge } from '@/components/ui/StatusBadge'
import { formatDueDate } from '@/lib/due-date'
import { TASK_STATUS_LABELS } from '@/lib/task-status'
import { TASK_STATUSES, type AnalyticsReport, type ProjectPerformance } from '@/types'

/** The overview cards that open a details drawer. */
export type Kpi = 'projects' | 'tasks' | 'completed' | 'active' | 'review' | 'overdue' | 'rate' | 'blocked'

const TITLES: Record<Kpi, string> = {
  projects: 'Projects',
  tasks: 'Total tasks',
  completed: 'Completed tasks',
  active: 'Active tasks',
  review: 'Awaiting review',
  overdue: 'Overdue tasks',
  rate: 'Completion rate',
  blocked: 'Blocked tasks',
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-surface-sunken px-4 py-6 text-center text-sm text-ink-muted">{children}</p>
}

function ProjectLink({ id, title }: { id: string; title: string }) {
  return (
    <Link href={`/dashboard/projects/${id}`} className="min-w-0 truncate text-sm font-medium text-ink hover:text-interactive">
      {title}
    </Link>
  )
}

/** One project per row with a count; only projects that have something to show. */
function CountRows({ rows, pick, unit, empty }: { rows: ProjectPerformance[]; pick: (p: ProjectPerformance) => number; unit: string; empty: string }) {
  const shown = rows.filter((p) => pick(p) > 0).sort((a, b) => pick(b) - pick(a) || a.title.localeCompare(b.title))
  if (shown.length === 0) return <Empty>{empty}</Empty>
  return (
    <ul className="space-y-2">
      {shown.map((p) => (
        <li key={p._id} className="flex items-center justify-between gap-3 rounded-xl border border-hairline px-3.5 py-3">
          <div className="min-w-0">
            <ProjectLink id={p._id} title={p.title} />
            <p className="text-xs text-ink-muted">
              {p.total} {p.total === 1 ? 'task' : 'tasks'} in total · {p.completionRate}% complete
            </p>
          </div>
          <span className="shrink-0 text-right">
            <span className="block text-lg font-semibold tabular-nums text-ink">{pick(p)}</span>
            <span className="block text-[11px] text-ink-muted">{unit}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The data behind one overview card, shown from what the report already holds. */
export function KpiDetails({ kpi, data, onClose }: { kpi: Kpi; data: AnalyticsReport; onClose: () => void }) {
  const o = data.overview
  const teamName = new Map(data.options.teams.map((t) => [t._id, t.name]))
  const teamOf = new Map(data.options.projects.map((p) => [p._id, p.teamId ? teamName.get(p.teamId) : undefined]))

  return (
    <Modal title={TITLES[kpi]} placement="right" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {kpi === 'projects' && (
          <>
            <p className="mb-4 text-sm text-ink-muted">
              <span className="text-2xl font-semibold tabular-nums text-ink">{o.projects}</span> {o.projects === 1 ? 'project' : 'projects'} in the selected scope
            </p>
            {data.projects.length === 0 ? (
              <Empty>No projects in this scope.</Empty>
            ) : (
              <ul className="space-y-2">
                {data.projects.map((p) => (
                  <li key={p._id} className="rounded-xl border border-hairline px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <ProjectLink id={p._id} title={p.title} />
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{p.completionRate}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                      <div className="h-full rounded-full bg-positive" style={{ width: `${p.completionRate}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      {teamOf.get(p._id) ? `Team ${teamOf.get(p._id)} · ` : 'No team · '}
                      {p.total} tasks · {p.active} active · {p.overdue} overdue
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {kpi === 'tasks' && (
          <>
            <p className="mb-4 text-sm text-ink-muted">
              <span className="text-2xl font-semibold tabular-nums text-ink">{o.tasks}</span> tasks in total
            </p>
            <h3 className="mb-2 text-sm font-semibold text-ink">By status</h3>
            <ul className="mb-5 grid grid-cols-2 gap-2">
              {TASK_STATUSES.map((s) => (
                <li key={s} className="flex items-center justify-between rounded-xl bg-surface-sunken px-3.5 py-2.5 text-sm">
                  <span className="text-ink-soft">{TASK_STATUS_LABELS[s]}</span>
                  <span className="font-semibold tabular-nums text-ink">{data.status[s]}</span>
                </li>
              ))}
            </ul>
            <h3 className="mb-2 text-sm font-semibold text-ink">By project</h3>
            <CountRows rows={data.projects} pick={(p) => p.total} unit="tasks" empty="No tasks yet." />
          </>
        )}

        {kpi === 'completed' && <CountRows rows={data.projects} pick={(p) => p.completed} unit="completed" empty="No task is complete yet." />}
        {kpi === 'active' && <CountRows rows={data.projects} pick={(p) => p.active} unit="active" empty="Nothing is active right now." />}
        {kpi === 'review' && <CountRows rows={data.projects} pick={(p) => p.inReview} unit="in review" empty="No task is waiting for review." />}

        {kpi === 'rate' && (
          <>
            <p className="mb-1 text-sm text-ink-muted">
              <span className="text-2xl font-semibold tabular-nums text-ink">{o.completionRate}%</span> — {o.completed} of {o.tasks} tasks complete
            </p>
            <p className="mb-4 text-xs text-ink-muted">Completed tasks ÷ all tasks, the same rule as each project&apos;s progress.</p>
            {data.projects.length === 0 ? (
              <Empty>No projects in this scope.</Empty>
            ) : (
              <ul className="space-y-2">
                {[...data.projects].sort((a, b) => b.completionRate - a.completionRate || a.title.localeCompare(b.title)).map((p) => (
                  <li key={p._id} className="rounded-xl border border-hairline px-3.5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <ProjectLink id={p._id} title={p.title} />
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{p.completionRate}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                      <div className="h-full rounded-full bg-positive" style={{ width: `${p.completionRate}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-ink-muted">
                      {p.completed} of {p.total} tasks
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {kpi === 'overdue' && (
          <>
            <p className="mb-4 text-sm text-ink-muted">
              <span className="text-2xl font-semibold tabular-nums text-ink">{data.overdue.total}</span> active {data.overdue.total === 1 ? 'task' : 'tasks'} past their due day
              {data.overdue.total > data.overdue.tasks.length && ` (the ${data.overdue.tasks.length} longest overdue are listed)`}
            </p>
            {data.overdue.tasks.length === 0 ? (
              <Empty>Nothing is overdue. Tasks due today are not overdue.</Empty>
            ) : (
              <ul className="space-y-2">
                {data.overdue.tasks.map((t) => (
                  <li key={t._id} className="rounded-xl border border-hairline px-3.5 py-3">
                    <Link href={`/dashboard/projects/${t.projectId}?task=${t._id}`} className="block break-words text-sm font-medium text-ink hover:text-interactive">
                      {t.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {t.projectTitle} · {t.assignee ?? 'Unassigned'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={t.priority} />
                      <span className="text-xs font-medium text-critical-strong">Due {formatDueDate(t.dueDate)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {kpi === 'blocked' && (
          <>
            <p className="mb-4 text-sm text-ink-muted">
              <span className="text-2xl font-semibold tabular-nums text-ink">{data.blocked.total}</span> active {data.blocked.total === 1 ? 'task' : 'tasks'} waiting on an unfinished task
            </p>
            {data.blocked.top.length === 0 ? (
              <Empty>No task is blocked by an unfinished prerequisite.</Empty>
            ) : (
              <ul className="space-y-2">
                {data.blocked.top.map((t) => (
                  <li key={t._id} className="rounded-xl border border-hairline px-3.5 py-3">
                    <Link href={`/dashboard/projects/${t.projectId}?task=${t._id}`} className="block break-words text-sm font-medium text-ink hover:text-interactive">
                      {t.title}
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {t.projectTitle} · waiting on {t.openBlockers} unfinished {t.openBlockers === 1 ? 'task' : 'tasks'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <PriorityBadge priority={t.priority} />
                      {t.waitingOn.map((w) => (
                        <span key={w._id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 py-1 text-xs text-ink-soft">
                          {w.title}
                          <TaskStatusBadge status={w.status} />
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
