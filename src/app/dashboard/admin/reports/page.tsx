'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ClipboardList, ArrowRight } from 'lucide-react'
import { reportsService } from '@/services/reports.service'

export default function AdminReportsPage() {
  const [reports, setReports] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    reportsService
      .listAll(0, 50)
      .then((data) => {
        setReports(data.reports)
        setTotal(data.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto max-w-4xl">
      <header className="animate-rise">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Reports</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {loading
            ? 'Loading…'
            : `${total} progress ${total === 1 ? 'report' : 'reports'} from every team leader`}
        </p>
      </header>

      <div className="mt-6">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-24 rounded-card" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div className="animate-rise rounded-card border border-dashed border-hairline bg-surface p-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <ClipboardList className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-medium text-ink">No reports yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
              Team leaders send a progress report from their project page —
              it'll show up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {reports.map((r, i) => (
              <li
                key={r._id}
                className="animate-rise rounded-card border border-hairline bg-surface p-5 shadow-card"
                style={{ animationDelay: `${Math.min(i, 8) * 0.03}s` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/dashboard/projects/${r.project?._id}`}
                      className="inline-flex items-center gap-1.5 font-medium text-ink hover:text-brand-600"
                    >
                      {r.project?.title}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {r.submittedBy?.name} · {r.team?.name}
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
                  <span className="font-semibold text-ink tabular-nums">
                    {r.completionRate}%
                  </span>{' '}
                  overall ({r.completedTasks}/{r.totalTasks})
                </p>

                {r.completedToday?.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {r.completedToday.map((t: any) => (
                      <li
                        key={t.task ?? t.title}
                        className="rounded-full bg-positive/10 px-2.5 py-1 text-xs font-medium text-positive"
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
    </div>
  )
}
