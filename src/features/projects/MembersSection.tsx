'use client'

import { useState, useEffect } from 'react'
import { Crown, Users, UserPlus, X, Search, Loader2 } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { usersService } from '@/services/users.service'
import { useProject } from '@/features/projects/ProjectContext'
import { useToast } from '@/hooks/useToast'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/PageState'
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '@/lib/roles'
import type { UserSummary } from '@/types'
import { errorMessage } from '@/services/client'

/** Who is on the project, and (for the owner) adding or removing hand-picked members. */
export function MembersSection() {
  const { project, can, applyProject } = useProject()
  const members = project.members ?? []
  const ownerId = project.owner?._id

  const [showInvite, setShowInvite] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<UserSummary[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { notify, toastNode } = useToast()

  // Debounce so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        setResults(await usersService.search(query.trim()))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const handleAdd = async (user: UserSummary) => {
    setBusyId(user._id)
    try {
      const updated = await projectsService.addMember(project._id, user._id)
      applyProject({ members: updated.members })
      notify('success', `${user.name} added to the project`)
      setQuery('')
      setResults([])
      setShowInvite(false)
    } catch (e) {
      notify('error', errorMessage(e, 'Could not add member'))
    } finally {
      setBusyId(null)
    }
  }

  const handleRemove = async (user: UserSummary) => {
    setBusyId(user._id)
    try {
      const updated = await projectsService.removeMember(project._id, user._id)
      applyProject({ members: updated.members })
      notify('success', `${user.name} removed`)
    } catch (e) {
      notify('error', errorMessage(e, 'Could not remove member'))
    } finally {
      setBusyId(null)
    }
  }

  const memberIds = new Set(members.map((m) => m._id))

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          {members.length} {members.length === 1 ? 'person' : 'people'} on this project
        </p>

        {can.canManageMembers && !showInvite && (
          <Button onClick={() => setShowInvite(true)} icon={<UserPlus className="h-4 w-4" />}>
            Add member
          </Button>
        )}
      </div>

      {showInvite && (
        <div className="animate-rise mt-4 rounded-card border border-hairline bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people by name or email…"
                className="h-11 w-full rounded-xl border border-hairline bg-surface pl-10 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-focus focus:outline-none focus:ring-4 focus:ring-focus/12"
              />
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setShowInvite(false)
                setQuery('')
              }}
              icon={<X className="h-4 w-4" />}
            >
              Cancel
            </Button>
          </div>

          <div className="mt-3">
            {searching ? (
              <p className="flex items-center gap-2 py-3 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching…
              </p>
            ) : query.trim().length < 2 ? (
              <p className="py-3 text-sm text-ink-faint">Type at least 2 characters to search.</p>
            ) : results.length === 0 ? (
              <p className="py-3 text-sm text-ink-faint">No matching users.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {results.map((r) => (
                  <li key={r._id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={r.name} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                      <p className="truncate text-xs text-ink-muted">{r.email}</p>
                    </div>
                    {memberIds.has(r._id) ? (
                      <span className="text-xs text-ink-faint">Already a member</span>
                    ) : (
                      <Button size="sm" isLoading={busyId === r._id} onClick={() => handleAdd(r)}>
                        Add
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {members.length === 0 ? (
          <EmptyState icon={<Users className="h-6 w-6" />} title="No members yet" />
        ) : (
          <ul className="divide-y divide-hairline">
            {members.map((member, i) => {
              const isOwner = member._id === ownerId
              // "Owner" is specific to this project; otherwise show the account role.
              const roleLabel = isOwner ? 'Owner' : ((member.role && ROLE_LABELS[member.role]) ?? 'Member')
              const roleBadgeClass = isOwner
                ? 'bg-caution-subtle text-caution-strong'
                : ((member.role && ROLE_BADGE_CLASSES[member.role]) ?? 'bg-surface-sunken text-ink-muted')

              return (
                <li
                  key={member._id}
                  className="animate-rise flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-sunken"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <Avatar name={member.name} size="lg" />

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{member.name}</p>
                    <p className="truncate text-sm text-ink-muted">{member.email}</p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${roleBadgeClass}`}
                  >
                    {isOwner && <Crown className="h-3 w-3" />}
                    {roleLabel}
                  </span>

                  {can.canManageMembers && !isOwner && (
                    <button
                      onClick={() => handleRemove(member)}
                      disabled={busyId === member._id}
                      className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-critical-subtle hover:text-critical-strong disabled:opacity-40"
                      aria-label={`Remove ${member.name}`}
                    >
                      {busyId === member._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {toastNode}
    </div>
  )
}
