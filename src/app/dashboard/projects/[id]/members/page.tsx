'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Crown, Users, UserPlus, X, Search, Loader2 } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { usersService } from '@/services/users.service'
import { useAuth } from '@/hooks/useAuth'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { Button } from '@/components/ui/Button'
import { Toast } from '@/components/ui/Toast'
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '@/lib/roles'
import { UserRole } from '@/types'

export default function MembersPage() {
  const params = useParams()
  const projectId = params.id as string
  const { user } = useAuth()

  const [members, setMembers] = useState<any[]>([])
  const [project, setProject] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)

  const load = useCallback(async () => {
    try {
      const [proj, list] = await Promise.all([
        projectsService.getOne(projectId),
        projectsService.getMembers(projectId),
      ])
      setProject(proj)
      setMembers(list ?? [])
    } catch (error) {
      console.error('Failed to load members:', error)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (projectId) load()
  }, [projectId, load])

  // Debounce so a fast typist does not fire a request per keystroke.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)

    if (query.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    timer.current = setTimeout(async () => {
      try {
        setResults(await usersService.search(query.trim()))
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [query])

  const ownerId =
    typeof project?.owner === 'string' ? project.owner : project?.owner?._id
  const isOwner = Boolean(ownerId && user && ownerId === user._id)

  const handleAdd = async (userId: string, name: string) => {
    setBusyId(userId)
    try {
      await projectsService.addMember(projectId, userId)
      setToast({ type: 'success', message: `${name} added to the project` })
      setQuery('')
      setResults([])
      setShowInvite(false)
      await load()
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.data?.error || 'Could not add member',
      })
    } finally {
      setBusyId(null)
    }
  }

  const handleRemove = async (userId: string, name: string) => {
    setBusyId(userId)
    try {
      await projectsService.removeMember(projectId, userId)
      setToast({ type: 'success', message: `${name} removed` })
      await load()
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.data?.error || 'Could not remove member',
      })
    } finally {
      setBusyId(null)
    }
  }

  if (loading || !project) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="skeleton h-8 w-64 rounded-lg" />
        <div className="skeleton h-64 rounded-card" />
      </div>
    )
  }

  const memberIds = new Set(members.map((m) => m._id))

  return (
    <div className="mx-auto max-w-7xl">
      <header className="animate-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {project.title}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {members.length} {members.length === 1 ? 'person' : 'people'} on this
            project
          </p>
        </div>

        {isOwner && !showInvite && (
          <Button
            onClick={() => setShowInvite(true)}
            icon={<UserPlus className="h-4 w-4" />}
          >
            Add member
          </Button>
        )}
      </header>

      <ProjectTabs projectId={projectId} />

      {showInvite && (
        <div className="animate-rise mt-6 rounded-card border border-hairline bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people by name or email…"
                className="h-11 w-full rounded-xl border border-hairline bg-surface pl-10 pr-4 text-sm text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
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
              <p className="py-3 text-sm text-ink-faint">
                Type at least 2 characters to search.
              </p>
            ) : results.length === 0 ? (
              <p className="py-3 text-sm text-ink-faint">No matching users.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {results.map((r) => {
                  const already = memberIds.has(r._id)
                  return (
                    <li key={r._id} className="flex items-center gap-3 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent text-xs font-semibold text-white">
                        {r.name?.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {r.name}
                        </p>
                        <p className="truncate text-xs text-ink-muted">
                          {r.email}
                        </p>
                      </div>
                      {already ? (
                        <span className="text-xs text-ink-faint">
                          Already a member
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          isLoading={busyId === r._id}
                          onClick={() => handleAdd(r._id, r.name)}
                        >
                          Add
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-card border border-hairline bg-surface shadow-card">
        {members.length === 0 ? (
          <div className="p-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Users className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-medium text-ink">No members yet</h3>
          </div>
        ) : (
          <ul className="divide-y divide-hairline">
            {members.map((member, i) => {
              const memberIsOwner = member._id === ownerId
              // Owner is a project-specific designation; otherwise show the
              // account's actual role (Project Manager / Team Leader / Developer).
              const roleLabel = memberIsOwner
                ? 'Owner'
                : (ROLE_LABELS[member.role as UserRole] ?? 'Member')
              const roleBadgeClass = memberIsOwner
                ? 'bg-caution/12 text-caution'
                : (ROLE_BADGE_CLASSES[member.role as UserRole] ??
                  'bg-surface-sunken text-ink-muted')

              return (
                <li
                  key={member._id}
                  className="animate-rise flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-sunken"
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent text-sm font-semibold text-white">
                    {member.name?.charAt(0).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {member.name}
                    </p>
                    <p className="truncate text-sm text-ink-muted">
                      {member.email}
                    </p>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${roleBadgeClass}`}
                  >
                    {memberIsOwner && <Crown className="h-3 w-3" />}
                    {roleLabel}
                  </span>

                  {isOwner && !memberIsOwner && (
                    <button
                      onClick={() => handleRemove(member._id, member.name)}
                      disabled={busyId === member._id}
                      className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-critical/10 hover:text-critical disabled:opacity-40"
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
