'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  X,
  UsersRound,
  Crown,
  Trash2,
  Pencil,
  Check,
} from 'lucide-react'
import { teamsService, adminUsersService } from '@/services/admin.service'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast } from '@/components/ui/Toast'

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<any[]>([])
  const [leaders, setLeaders] = useState<any[]>([])
  const [developers, setDevelopers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingTeam, setEditingTeam] = useState<any>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [teamsData, leadersData, devsData] = await Promise.all([
        teamsService.list(),
        adminUsersService.list('team_leader'),
        adminUsersService.list('developer'),
      ])
      setTeams(teamsData)
      setLeaders(leadersData.users)
      setDevelopers(devsData.users)
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.status === 403 ? 'Admin access required' : 'Failed to load teams',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (id: string) => {
    setBusyId(id)
    try {
      await teamsService.delete(id)
      setToast({ type: 'success', message: 'Team deleted' })
      await load()
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.data?.error || 'Failed to delete team',
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Teams</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Build a roster once — a team leader plus their developers — then staff
            a project with it in one step.
          </p>
        </div>
        {!showForm && !editingTeam && (
          <Button
            onClick={() => setShowForm(true)}
            icon={<Plus className="h-4 w-4" />}
            disabled={leaders.length === 0}
          >
            Create team
          </Button>
        )}
      </header>

      {!loading && leaders.length === 0 && !showForm && (
        <p className="animate-rise mt-4 rounded-xl border border-caution/30 bg-caution/6 px-4 py-3 text-sm text-ink-soft">
          You need at least one <strong>Team Leader</strong> account before you can
          create a team.{' '}
          <a href="/dashboard/admin/users" className="font-medium text-brand-600 hover:underline">
            Create one
          </a>
          .
        </p>
      )}

      {showForm && (
        <TeamForm
          leaders={leaders}
          developers={developers}
          onCancel={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      {editingTeam && (
        <TeamForm
          leaders={leaders}
          developers={developers}
          initial={editingTeam}
          onCancel={() => setEditingTeam(null)}
          onSaved={() => {
            setEditingTeam(null)
            load()
          }}
        />
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          [0, 1].map((i) => <div key={i} className="skeleton h-28 rounded-card" />)
        ) : teams.length === 0 ? (
          <div className="rounded-card border border-dashed border-hairline bg-surface p-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <UsersRound className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-medium text-ink">No teams yet</h3>
          </div>
        ) : (
          teams.map((team, i) => (
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
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => setEditingTeam(team)}
                    className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
                    aria-label={`Edit ${team.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(team._id)}
                    disabled={busyId === team._id}
                    className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-40"
                    aria-label={`Delete ${team.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-caution/12 px-2.5 py-1 text-xs font-medium text-caution">
                  <Crown className="h-3 w-3" />
                  {team.teamLeader?.name}
                </span>
                {team.members.map((m: any) => (
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

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

function TeamForm({
  leaders,
  developers,
  initial,
  onCancel,
  onSaved,
}: {
  leaders: any[]
  developers: any[]
  initial?: any
  onCancel: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [teamLeaderId, setTeamLeaderId] = useState(
    initial?.teamLeader?._id ?? leaders[0]?._id ?? ''
  )
  const [memberIds, setMemberIds] = useState<Set<string>>(
    new Set((initial?.members ?? []).map((m: any) => m._id))
  )
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const toggleMember = (id: string) => {
    setMemberIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (name.trim().length < 2) return setError('Team name must be at least 2 characters')
    if (!teamLeaderId) return setError('Select a team leader')

    setLoading(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        teamLeaderId,
        memberIds: [...memberIds],
      }
      if (initial) {
        await teamsService.update(initial._id, payload)
      } else {
        await teamsService.create(payload)
      }
      onSaved()
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to save team')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-rise mt-5 rounded-card border border-hairline bg-surface p-5 shadow-card"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Team name" value={name} onChange={(e) => setName(e.target.value)} />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-soft">
            Team leader
          </label>
          <select
            value={teamLeaderId}
            onChange={(e) => setTeamLeaderId(e.target.value)}
            className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
          >
            {leaders.map((l) => (
              <option key={l._id} value={l._id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-sm font-medium text-ink-soft">Developers</p>
        {developers.length === 0 ? (
          <p className="text-sm text-ink-faint">No developer accounts yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {developers.map((dev) => {
              const checked = memberIds.has(dev._id)
              return (
                <button
                  type="button"
                  key={dev._id}
                  onClick={() => toggleMember(dev._id)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    checked
                      ? 'border-brand-300 bg-brand-50 text-brand-700'
                      : 'border-hairline text-ink-soft hover:bg-surface-sunken'
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-hairline'
                    }`}
                  >
                    {checked && <Check className="h-3 w-3" />}
                  </span>
                  <span className="truncate">{dev.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-critical">{error}</p>}

      <div className="mt-4 flex gap-2 border-t border-hairline pt-4">
        <Button type="submit" isLoading={loading}>
          {initial ? 'Save changes' : 'Create team'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} icon={<X className="h-4 w-4" />}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
