'use client'

import Link from 'next/link'
import { ClipboardList, ArrowRight } from 'lucide-react'
import { reportsService } from '@/services/reports.service'
import { useLoad } from '@/hooks/useLoad'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { ManagerOnly } from '@/features/auth/ManagerOnly'
import { useAuthStore } from '@/store/authStore'
import { AnalyticsDashboard } from '@/features/reports/analytics/AnalyticsDashboard'

/** The feed of progress reports team leaders send to admin (its API is admin-only). */
function ProgressReports() {
  const { data, loading, error, errorStatus, reload } = useLoad(
    () => reportsService.listAll(0, 50),
    []
  )
  const reports = data?.reports ?? []
  const total = data?.total ?? 0

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Progress reports</h2>
      <p className="mt-0.5 text-sm text-ink-muted">
        {loading
          ? 'Loading…'
          : data
            ? `${total} progress ${total === 1 ? 'report' : 'reports'} from every team leader`
            : 'Could not load reports'}
      </p>
      <div className="mt-3">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24 rounded-card" />
            ))}
          </div>
        ) : !data ? (
          <ErrorState message={error} status={errorStatus} onRetry={reload} />
        ) : reports.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No reports yet">
            Team leaders send a progress report from their project page, and it will show up here.
          </EmptyState>
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {reports.map((r, i) => (
              <li
                key={r._id}
                className="animate-rise rounded-card border border-hairline bg-surface p-5 shadow-card"
                style={{ animationDelay: `${Math.min(i, 8) * 0.03}s` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    {r.project ? (
                      <Link
                        href={`/dashboard/projects/${r.project._id}`}
                        className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-interactive"
                      >
                        {r.project.title}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : (
                      <span className="font-medium text-ink-muted">Deleted project</span>
                    )}
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {r.submittedBy?.name} · {typeof r.team === 'object' ? r.team?.name : ''}
                    </p>
                  </div>
                  <span className="text-xs text-ink-faint">
                    {new Date(r.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <p className="mt-3 text-sm text-ink-soft">
                  <span className="font-semibold text-ink tabular-nums">
                    {r.completedToday?.length ?? 0}
                  </span>{' '}
                  task(s) completed that day —{' '}
                  <span className="font-semibold text-ink tabular-nums">{r.completionRate}%</span>{' '}
                  overall ({r.completedTasks}/{r.totalTasks})
                </p>

                {r.completedToday?.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {r.completedToday.map((t) => (
                      <li
                        key={t.task ?? t.title}
                        className="rounded-full bg-positive-subtle px-2.5 py-1 text-xs font-medium text-positive-strong"
                      >
                        {t.title}
                      </li>
                    ))}
                  </ul>
                )}

                {r.note && (
                  <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
                    “{r.note}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function ReportsContent() {
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin')

  return (
    <div>
      <header className="animate-rise">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Reports</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {isAdmin ? 'Analytics and progress reports across every team and project' : 'Analytics for the teams you lead and the projects you manage'}
        </p>
      </header>

      <div className="mt-6">
        <AnalyticsDashboard />
      </div>

      {/* Progress reports are written by team leaders and read by admin. */}
      {isAdmin && <ProgressReports />}
    </div>
  )
}

export default function ReportsPage() {
  return (
    <ManagerOnly>
      <ReportsContent />
    </ManagerOnly>
  )
}
