'use client'

import Link from 'next/link'
import { AlertTriangle, FolderKanban, UserRound, UsersRound } from 'lucide-react'
import { StatsCard } from '@/components/ui/StatsCard'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import type { Project } from '@/types'

interface AdminOverviewProps {
  projects: Project[]
  projectCount: number
  ready: boolean
}

/**
 * The admin's setup view: projects, teams, users, and the projects nobody can
 * work on yet because no team is assigned. Every number is a real count.
 */
export function AdminOverview({ projects, projectCount, ready }: AdminOverviewProps) {
  const teams = useRealtimeData<{ teams: unknown[] }>({ endpoint: '/api/admin/teams', watch: ['teams'] })
  const users = useRealtimeData<{ users: unknown[]; total: number }>({ endpoint: '/api/admin/users?limit=1', watch: [] })

  const withoutTeam = projects.filter((p) => !p.team)
  const dash = (value: number | undefined, loaded: boolean) => (loaded && value !== undefined ? value : '—')

  if (!ready) {
    return (
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-busy="true" aria-label="Loading overview">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-card" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatsCard label="Projects" value={projectCount} hint="you own or belong to" icon={<FolderKanban className="h-5 w-5" />} tone="brand" delay={0.02} />
        <StatsCard label="Teams" value={dash(teams.data?.teams.length, Boolean(teams.data))} hint="leader + developers" icon={<UsersRound className="h-5 w-5" />} tone="brand" delay={0.06} />
        <StatsCard label="Users" value={dash(users.data?.total, Boolean(users.data))} hint="all roles" icon={<UserRound className="h-5 w-5" />} tone="brand" delay={0.1} />
        <StatsCard
          label="Without a team"
          value={withoutTeam.length}
          hint={withoutTeam.length > 0 ? 'nobody can work on these yet' : 'every project is staffed'}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={withoutTeam.length > 0 ? 'caution' : 'positive'}
          delay={0.14}
        />
      </div>

      {withoutTeam.length > 0 && (
        <section
          aria-label="Projects without a team"
          className="animate-rise rounded-card border border-caution/30 bg-caution-subtle/50 p-4 sm:p-5"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold text-caution-strong">
            <AlertTriangle className="h-4 w-4" />
            {withoutTeam.length} {withoutTeam.length === 1 ? 'project has' : 'projects have'} no team assigned
          </h2>
          <p className="mt-1 text-xs text-ink-muted">Open the project&apos;s Settings and choose a team under Staffing.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {withoutTeam.map((p) => (
              <li key={p._id}>
                <Link
                  href={`/dashboard/projects/${p._id}/settings`}
                  className="inline-flex rounded-lg border border-caution/30 bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken"
                >
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
