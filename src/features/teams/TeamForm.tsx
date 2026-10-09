'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { teamsService } from '@/services/admin.service'
import type { AdminUser } from '@/services/admin.service'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import type { Team } from '@/types'
import { errorMessage } from '@/services/client'

interface TeamFormProps {
  leaders: AdminUser[]
  developers: AdminUser[]
  /** Present when editing an existing team. */
  initial?: Team
  onCancel: () => void
  onSaved: () => void
}

/** Create a team, or edit one: a name, a team leader and the developers on it. */
export function TeamForm({ leaders, developers, initial, onCancel, onSaved }: TeamFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [teamLeaderId, setTeamLeaderId] = useState(initial?.teamLeader?._id ?? leaders[0]?._id ?? '')
  const [memberIds, setMemberIds] = useState<Set<string>>(
    new Set((initial?.members ?? []).map((m) => m._id))
  )
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const toggleMember = (id: string) => {
    setMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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
      if (initial) await teamsService.update(initial._id, payload)
      else await teamsService.create(payload)
      onSaved()
    } catch (e) {
      setError(errorMessage(e, 'Failed to save team'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-rise mt-5 rounded-card border border-hairline bg-surface p-5 shadow-card"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Input label="Team name" value={name} onChange={(e) => setName(e.target.value)} />

        <Select
          label="Team leader"
          value={teamLeaderId}
          onChange={(e) => setTeamLeaderId(e.target.value)}
        >
          {leaders.map((l) => (
            <option key={l._id} value={l._id}>
              {l.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-4 lg:max-w-none">
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
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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
                      checked ? 'border-interactive bg-interactive text-on-brand' : 'border-hairline'
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

      {error && <p className="mt-3 text-sm text-critical-strong">{error}</p>}

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
