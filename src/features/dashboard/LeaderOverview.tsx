'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { ErrorState } from '@/components/ui/PageState'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { addDays } from '@/lib/analytics'
import { localToday } from '@/lib/due-date'
import { OverviewCards } from '@/features/reports/analytics/OverviewCards'
import type { AnalyticsReport } from '@/types'

/**
 * A team leader's analytics overview, scoped by the server to the teams they
 * lead and the projects they manage: the last 30 days, in their own time zone.
 */
export function LeaderOverview() {
  const endpoint = useMemo(() => {
    const today = localToday()
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    return `/api/analytics?${new URLSearchParams({ today, from: addDays(today, -29), to: today, timeZone })}`
  }, [])

  const { data, isLoading, error, errorStatus, refetch } = useRealtimeData<AnalyticsReport>({
    endpoint,
    watch: ['tasks', 'projects', 'teams', 'taskdependencies'],
  })

  return (
    <section aria-label="Overview" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Overview</h2>
        <Link href="/dashboard/admin/reports" className="inline-flex items-center gap-1 text-xs font-medium text-interactive hover:text-interactive-hover">
          Full reports
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {error && !data ? (
        <ErrorState compact message="Unable to load the overview." status={errorStatus} onRetry={refetch} />
      ) : isLoading && !data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading overview">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton h-28 rounded-card" />
          ))}
        </div>
      ) : data ? (
        <OverviewCards data={data} />
      ) : null}
    </section>
  )
}
