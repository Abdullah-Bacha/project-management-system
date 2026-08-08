'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Crown, Users2, FolderKanban, ArrowRight } from 'lucide-react'
import { myTeamService } from '@/services/team.service'
import { useAuth } from '@/hooks/useAuth'

export default function MyTeamPage() {
  const { user } = useAuth()
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    myTeamService
      .get()
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="skeleton h-8 w-56 rounded-lg" />
        <div className="skeleton h-48 rounded-card" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="animate-rise">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">My Team</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {teams.length === 0
            ? 'Not staffed on a team yet.'
            : `You're on ${teams.length} ${teams.length === 1 ? 'team' : 'teams'}.`}
        </p>
      </header>

      {teams.length === 0 ? (
        <div className="animate-rise mt-6 rounded-card border border-dashed border-hairline bg-surface p-12 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <Users2 className="h-6 w-6" />
          </span>
          <h3 className="mt-4 font-medium text-ink">No team yet</h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
            An admin adds you to a team when one is created. Check back once
            you&apos;ve been staffed.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {teams.map((team, i) => {
            const isLeader = team.teamLeader?._id === user?._id
            return (
              <article
                key={team._id}
                className="animate-rise rounded-card border border-hairline bg-surface p-5 shadow-card"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-ink">{team.name}</h3>
                    {team.description && (
                      <p className="mt-0.5 text-sm text-ink-muted">{team.description}</p>
                    )}
                  </div>
                  {isLeader && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-caution/12 px-2.5 py-1 text-[11px] font-medium text-caution">
                      <Crown className="h-3 w-3" />
                      You lead this team
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-caution/12 px-2.5 py-1 text-xs font-medium text-caution">
                    <Crown className="h-3 w-3" />
                    {team.teamLeader?.name}
                  </span>
                  {team.members
                    .filter((m: any) => m._id !== team.teamLeader?._id)
                    .map((m: any) => (
                      <span
                        key={m._id}
                        className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-ink-muted"
                      >
                        {m.name}
                      </span>
                    ))}
                </div>

                {team.projects?.length > 0 && (
                  <div className="mt-4 border-t border-hairline pt-4">
                    <p className="mb-2 text-xs font-medium text-ink-muted">Staffed on</p>
                    <div className="space-y-1.5">
                      {team.projects.map((p: any) => (
                        <Link
                          key={p._id}
                          href={`/dashboard/projects/${p._id}`}
                          className="group flex items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-surface-sunken"
                        >
                          <span className="inline-flex items-center gap-2 text-ink-soft">
                            <FolderKanban className="h-3.5 w-3.5 text-ink-faint" />
                            {p.title}
                          </span>
                          <ArrowRight className="h-3.5 w-3.5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
