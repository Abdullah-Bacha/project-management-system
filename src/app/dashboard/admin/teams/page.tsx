'use client'

import { useState } from 'react'
import { Plus, UsersRound, Crown, Trash2, Pencil } from 'lucide-react'
import { teamsService, adminUsersService } from '@/services/admin.service'
import { useLoad } from '@/hooks/useLoad'
import { useToast } from '@/hooks/useToast'
import { TeamForm } from '@/features/teams/TeamForm'
import { TeamDetails } from '@/features/teams/TeamDetails'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import type { Team } from '@/types'
import { AdminOnly } from '@/features/auth/AdminOnly'

// The pickers need everyone, so ask for the API's largest page.
const PICKER_LIMIT = 100

function AdminTeamsContent() {
  // Team changes only reload teams: the leader/developer pickers come from the
  // users list, which creating or editing a team does not affect.
  const teams = useLoad(() => teamsService.list(), [])
  const leaders = useLoad(() => adminUsersService.list('team_leader', PICKER_LIMIT), [])
  const developers = useLoad(() => adminUsersService.list('developer', PICKER_LIMIT), [])

  const [showForm, setShowForm] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const { notify, toastNode } = useToast()

  const leaderList = leaders.data?.users ?? []
  const developerList = developers.data?.users ?? []

  const handleDelete = async (id: string) => {
    setBusyId(id)
    try {
      await teamsService.delete(id)
      notify('success', 'Team deleted')
      await teams.reload()
    } catch (e: any) {
      notify('error', e.response?.data?.error || 'Failed to delete team')
    } finally {
      setBusyId(null)
    }
  }

  const viewing = teams.data?.find((t) => t._id === viewingId) ?? null

  const closeForm = () => {
    setShowForm(false)
    setEditingTeam(null)
  }

  return (
    <div>
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Teams</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Build a roster once — a team leader plus their developers — then staff a project with
            it in one step.
          </p>
        </div>
        {!showForm && !editingTeam && (
          <Button
            onClick={() => setShowForm(true)}
            icon={<Plus className="h-4 w-4" />}
            disabled={leaderList.length === 0}
          >
            Create team
          </Button>
        )}
      </header>

      {!leaders.loading && !leaders.error && leaderList.length === 0 && !showForm && (
        <p className="animate-rise mt-4 rounded-xl border border-caution/30 bg-caution-subtle px-4 py-3 text-sm text-ink-soft">
          You need at least one <strong>Team Leader</strong> account before you can create a team.{' '}
          <a href="/dashboard/admin/users" className="font-medium text-interactive hover:underline">
            Create one
          </a>
          .
        </p>
      )}

      {(showForm || editingTeam) && (
        <TeamForm
          key={editingTeam?._id ?? 'new'}
          leaders={leaderList}
          developers={developerList}
          initial={editingTeam ?? undefined}
          onCancel={closeForm}
          onSaved={() => {
            closeForm()
            void teams.reload()
          }}
        />
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {teams.loading ? (
          [0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-36 rounded-card" />)
        ) : !teams.data ? (
          <div className="col-span-full"><ErrorState message={teams.error} status={teams.errorStatus} onRetry={teams.reload} /></div>
        ) : teams.data.length === 0 ? (
          <div className="col-span-full"><EmptyState icon={<UsersRound className="h-6 w-6" />} title="No teams yet" /></div>
        ) : (
          teams.data.map((team, i) => (
            <article
              key={team._id}
              onClick={() => setViewingId(team._id)}
              className="animate-rise flex cursor-pointer flex-col rounded-card border border-hairline bg-surface p-5 shadow-card transition-all duration-200 hover:border-brand-300 hover:shadow-lifted"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setViewingId(team._id)
                      }}
                      aria-label={`View details for ${team.name}`}
                      className="break-words text-left focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      {team.name}
                    </button>
                  </h3>
                  {team.description && (
                    <p className="mt-0.5 text-sm text-ink-muted">{team.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditingTeam(team)
                    }}
                    className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
                    aria-label={`Edit ${team.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(team._id)
                    }}
                    disabled={busyId === team._id}
                    className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-critical-subtle hover:text-critical-strong disabled:opacity-40"
                    aria-label={`Delete ${team.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-caution-subtle px-2.5 py-1 text-xs font-medium text-caution-strong">
                  <Crown className="h-3 w-3" />
                  {team.teamLeader?.name}
                </span>
                {team.members.map((m) => (
                  <span
                    key={m._id}
                    className="rounded-full bg-surface-sunken px-2.5 py-1 text-xs font-medium text-ink-muted"
                  >
                    {m.name}
                  </span>
                ))}
                {team.members.length === 0 && (
                  <span className="text-xs text-ink-faint">No developers yet</span>
                )}
              </div>
            </article>
          ))
        )}
      </div>

      {viewing && (
        <TeamDetails
          team={viewing}
          onClose={() => setViewingId(null)}
          onEdit={() => {
            setViewingId(null)
            setEditingTeam(viewing)
          }}
        />
      )}

      {toastNode}
    </div>
  )
}

export default function AdminTeamsPage() {
  return (
    <AdminOnly>
      <AdminTeamsContent />
    </AdminOnly>
  )
}
