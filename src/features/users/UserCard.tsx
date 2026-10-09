'use client'

import { useRef, useState } from 'react'
import clsx from 'clsx'
import { Check, ChevronDown, Pencil } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useDismiss } from '@/hooks/useDismiss'
import { ASSIGNABLE_ROLES, ROLE_BADGE_CLASSES, ROLE_LABELS } from '@/lib/roles'
import type { AdminUser } from '@/services/admin.service'
import type { PresenceEntry } from '@/services/presence.service'
import { PresenceBadge } from './PresenceBadge'
import type { UserRole } from '@/types'

interface UserCardProps {
  user: AdminUser
  index: number
  isMe: boolean
  busy: boolean
  onRoleChange: (role: UserRole) => void
  onEdit: () => void
  /** Whether they have a TaskFlow tab open (admin view). */
  presence?: PresenceEntry
}

/** One account: avatar, name, role and a dropdown to change the role. */
export function UserCard({ user, index, isMe, busy, onRoleChange, onEdit, presence }: UserCardProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))

  const disabled = busy || isMe

  return (
    <li
      className={clsx(
        'animate-rise relative flex flex-col gap-4 rounded-card border border-hairline bg-surface p-5 shadow-card transition-shadow duration-200 hover:shadow-lifted',
        open && 'z-20'
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 0.03}s` }}
    >
      <div className="flex items-center gap-3.5">
        <Avatar name={user.name} src={user.profilePicture} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">
            {user.name}
            {isMe && <span className="ml-1.5 text-xs font-normal text-ink-faint">(you)</span>}
          </p>
          <p className="truncate text-xs text-ink-muted">{user.email}</p>
          {user.phone && <p className="truncate text-xs text-ink-muted">{user.phone}</p>}
          <div className="mt-1.5">
            <PresenceBadge presence={presence} />
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${user.name}`}
          className="shrink-0 rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-hairline pt-4">
        <span
          className={clsx(
            'rounded-full px-2.5 py-1 text-[11px] font-medium',
            ROLE_BADGE_CLASSES[user.role]
          )}
        >
          {ROLE_LABELS[user.role] ?? user.role}
        </span>

        <div ref={ref} className="relative">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={`Change role for ${user.name}`}
            title={isMe ? 'You cannot change your own role' : 'Change role'}
            className={clsx(
              'inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline px-2.5 text-xs font-medium text-ink-soft',
              'transition-colors duration-150 hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-50',
              open && 'bg-surface-sunken'
            )}
          >
            {busy ? 'Saving…' : 'Change role'}
            <ChevronDown
              className={clsx('h-3.5 w-3.5 text-ink-faint transition-transform duration-150', open && 'rotate-180')}
            />
          </button>

          {open && (
            <div
              role="menu"
              aria-label={`Roles for ${user.name}`}
              className="animate-rise absolute right-0 top-full z-30 mt-1.5 w-44 overflow-hidden rounded-xl border border-hairline bg-surface p-1.5 shadow-lifted"
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  role="menuitemradio"
                  aria-checked={role === user.role}
                  onClick={() => {
                    setOpen(false)
                    if (role !== user.role) onRoleChange(role)
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
                >
                  {ROLE_LABELS[role]}
                  {role === user.role && <Check className="h-4 w-4 text-interactive" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
