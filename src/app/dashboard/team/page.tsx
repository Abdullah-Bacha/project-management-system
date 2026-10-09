'use client'

import { useState } from 'react'
import Link from 'next/link'
import { TeamMemberCard } from '@/features/teams/TeamMemberCard'
import type { Team, UserSummary } from '@/types'
import { Crown, Users2, FolderKanban, ArrowRight } from 'lucide-react'
import { myTeamService, messageService } from '@/services/team.service'
import { useAuth } from '@/hooks/useAuth'
import { useLoad } from '@/hooks/useLoad'
import { useRealtimeEvent } from '@/hooks/useRealtimeData'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { WorkloadPanel } from '@/features/workload/WorkloadPanel'

function MemberTeamView() {
  const { user } = useAuth()
  const [selected, setSelected] = useState<{ member: UserSummary; team: Team } | null>(null)
  const { data: teams, loading, error, errorStatus, reload } = useLoad(() => myTeamService.get(), [])

  const { data: unread, reload: reloadUnread } = useLoad(() => messageService.unread(), [])
  useRealtimeEvent(['messages'], () => void reloadUnread())

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-56 rounded-lg" />
        <div className="skeleton h-48 rounded-card" />
      </div>
    )
  }

  if (!teams) return <ErrorState message={error} status={errorStatus} onRetry={reload} />

  return (
    <div>
      <header className="animate-rise">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">My Team</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {teams.length === 0
            ? 'Not staffed on a team yet.'
            : `You're on ${teams.length} ${teams.length === 1 ? 'team' : 'teams'}.`}
        </p>
      </header>

      {teams.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={<Users2 className="h-6 w-6" />} title="No team yet">
            An admin adds you to a team when one is created. Check back once you&apos;ve been
            staffed.
          </EmptyState>
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
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-caution-subtle px-2.5 py-1 text-[11px] font-medium text-caution-strong">
                      <Crown className="h-3 w-3" />
                      You lead this team
                    </span>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {team.teamLeader && (
                    <button
                      onClick={() => setSelected({ member: team.teamLeader, team })}
                      className="inline-flex items-center gap-1.5 rounded-full bg-caution-subtle px-2.5 py-1 text-xs font-medium text-caution-strong transition-all hover:brightness-95 active:scale-95"
                    >
                      <Crown className="h-3 w-3" />
                      {team.teamLeader.name}
                      {!!unread?.[team.teamLeader._id] && (
                        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold text-on-brand">
                          {unread[team.teamLeader._id]}
                        </span>
                      )}
                    </button>
                  )}
                  {team.members
                    .filter((m) => m._id !== team.teamLeader?._id)
                    .map((m) => (
                      <button
                        key={m._id}
                        onClick={() => setSelected({ member: m, team })}
                        className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-ink-muted transition-all hover:bg-brand-50 hover:text-ink active:scale-95"
                      >
                        {m.name}
                        {!!unread?.[m._id] && (
                        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold text-on-brand">
                          {unread[m._id]}
                        </span>
                      )}
                      </button>
                    ))}
                </div>

                {!!team.projects?.length && (
                  <div className="mt-4 border-t border-hairline pt-4">
                    <p className="mb-2 text-xs font-medium text-ink-muted">Staffed on</p>
                    <div className="space-y-1.5">
                      {team.projects.map((p) => (
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

      {/* Team workload: a leader's view of their own teams (the API scopes it; developers have no team-wide view). */}
      {user?.role === 'team_leader' && (
        <div className="mt-8">
          <WorkloadPanel />
        </div>
      )}

      {selected && (
        <TeamMemberCard
          member={selected.member}
          teamName={selected.team.name}
          isTeamLeader={selected.member._id === selected.team.teamLeader?._id}
          isSelf={selected.member._id === user?._id}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

/** Administrators belong to no team; for them this page is the team workload across every team. */
function AdminTeamView() {
  return (
    <div>
      <header className="animate-rise">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">My Team</h1>
        <p className="mt-1 text-sm text-ink-muted">Who is carrying how much work, across every team.</p>
      </header>
      <div className="mt-6">
        <WorkloadPanel />
      </div>
    </div>
  )
}

export default function MyTeamPage() {
  const { user } = useAuth()
  // The role comes from the server-confirmed user; until it is known, show a placeholder rather than the wrong view.
  if (!user) return <div className="skeleton h-48 rounded-card" />
  return user.role === 'admin' ? <AdminTeamView /> : <MemberTeamView />
}
