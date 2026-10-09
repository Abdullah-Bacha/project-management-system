'use client'

import Link from 'next/link'
import { ArrowRight, Crown, FolderKanban, Mail, Pencil, Phone } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ProjectStatusBadge } from '@/components/ui/StatusBadge'
import { ROLE_BADGE_CLASSES, ROLE_LABELS } from '@/lib/roles'
import type { Team, UserSummary } from '@/types'

function Person({ user, lead }: { user: UserSummary; lead?: boolean }) {
  return (
    <li className="rounded-xl border border-hairline p-3">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} src={user.profilePicture} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-ink">
            <span className="break-words">{user.name}</span>
            {lead && (
              <span className="inline-flex items-center gap-1 rounded-full bg-caution-subtle px-2 py-0.5 text-[11px] font-medium text-caution-strong">
                <Crown className="h-3 w-3" />
                Team lead
              </span>
            )}
          </p>
          {user.role && (
            <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_BADGE_CLASSES[user.role]}`}>{ROLE_LABELS[user.role]}</span>
          )}
        </div>
      </div>
      <dl className="mt-2 space-y-1 text-xs text-ink-muted">
        <div className="flex items-center gap-2">
          <Mail className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <dd className="min-w-0 break-all">{user.email}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <dd>{user.phone || 'No contact number'}</dd>
        </div>
      </dl>
    </li>
  )
}

/** Everything about one team: who leads it, who is on it, and what it is staffed on. */
export function TeamDetails({ team, onClose, onEdit }: { team: Team; onClose: () => void; onEdit: () => void }) {
  const members = team.members.filter((m) => m._id !== team.teamLeader?._id)
  const projects = team.projects ?? []

  return (
    <Modal title="Team details" placement="right" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
        <div>
          <h3 className="break-words text-lg font-semibold text-ink">{team.name}</h3>
          {team.description && <p className="mt-1 whitespace-pre-line break-words text-sm text-ink-muted">{team.description}</p>}
          <p className="mt-2 text-xs text-ink-faint">
            {members.length + (team.teamLeader ? 1 : 0)} {members.length + (team.teamLeader ? 1 : 0) === 1 ? 'person' : 'people'} · created {new Date(team.createdAt).toLocaleDateString()}
            {team.createdBy?.name ? ` by ${team.createdBy.name}` : ''}
          </p>
        </div>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-ink">Team leader</h4>
          {team.teamLeader ? (
            <ul>
              <Person user={team.teamLeader} lead />
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">No leader assigned.</p>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-ink">
            Developers <span className="font-normal text-ink-faint">({members.length})</span>
          </h4>
          {members.length === 0 ? (
            <p className="rounded-xl bg-surface-sunken px-4 py-4 text-center text-sm text-ink-muted">No developers yet.</p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <Person key={m._id} user={m} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-sm font-semibold text-ink">
            Staffed on <span className="font-normal text-ink-faint">({projects.length})</span>
          </h4>
          {projects.length === 0 ? (
            <p className="rounded-xl bg-surface-sunken px-4 py-4 text-center text-sm text-ink-muted">Not assigned to any project yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {projects.map((p) => (
                <li key={p._id}>
                  <Link href={`/dashboard/projects/${p._id}`} className="group flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-surface-sunken">
                    <span className="inline-flex min-w-0 items-center gap-2 text-ink-soft">
                      <FolderKanban className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                      <span className="truncate">{p.title}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-2">
                      <ProjectStatusBadge status={p.status} />
                      <ArrowRight className="h-3.5 w-3.5 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <footer className="shrink-0 border-t border-hairline p-4">
        <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>
          Edit team
        </Button>
      </footer>
    </Modal>
  )
}
