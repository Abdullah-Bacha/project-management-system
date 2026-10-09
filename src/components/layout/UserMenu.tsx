'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { ChevronDown, LogOut, Users2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useDismiss } from '@/hooks/useDismiss'
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '@/lib/roles'
import type { User } from '@/types'

interface UserMenuProps {
  user: User | null
  onLogout: () => void
}

/**
 * The signed-in user in the navbar: avatar, name and role, with a dropdown.
 * There is no profile or settings page yet, so the dropdown shows the account
 * details and the actions that exist today (My Team for team members, Sign out)
 * instead of links that go nowhere.
 */
export function UserMenu({ user, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, () => setOpen(false))

  if (!user) return null

  const roleLabel = ROLE_LABELS[user.role] ?? user.role
  const isTeamMember = user.role === 'team_leader' || user.role === 'developer'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        title={`${user.name} · ${roleLabel}`}
        className={clsx(
          'flex items-center gap-2.5 rounded-xl p-1.5 text-left transition-colors duration-150 lg:pr-2.5',
          'hover:bg-surface-sunken',
          open && 'bg-surface-sunken'
        )}
      >
        <Avatar name={user.name} src={user.profilePicture} />
        <span className="hidden min-w-0 lg:block">
          <span className="block max-w-32 truncate text-sm font-medium leading-tight text-ink">
            {user.name}
          </span>
          <span className="block text-xs leading-tight text-ink-muted">{roleLabel}</span>
        </span>
        <ChevronDown
          className={clsx(
            'hidden h-4 w-4 shrink-0 text-ink-faint transition-transform duration-150 lg:block',
            open && 'rotate-180'
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="animate-rise absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-hairline bg-surface shadow-lifted"
        >
          <div className="flex items-center gap-3 px-4 py-3.5">
            <Avatar name={user.name} src={user.profilePicture} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{user.name}</p>
              <p className="truncate text-xs text-ink-muted">{user.email}</p>
              <span
                className={clsx(
                  'mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
                  ROLE_BADGE_CLASSES[user.role]
                )}
              >
                {roleLabel}
              </span>
            </div>
          </div>

          {isTeamMember && (
            <div className="border-t border-hairline p-1.5">
              <Link
                href="/dashboard/team"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-soft transition-colors hover:bg-surface-sunken hover:text-ink"
              >
                <Users2 className="h-4 w-4 text-ink-faint" />
                My Team
              </Link>
            </div>
          )}

          <div className="border-t border-hairline p-1.5">
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onLogout()
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-critical-strong transition-colors hover:bg-critical-subtle"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
