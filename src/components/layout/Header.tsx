'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import type { User } from '@/types'
import { NavbarSearch } from './NavbarSearch'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'
import { pageTitle } from './navigation'

interface HeaderProps {
  user: User | null
  unreadCount: number
  onLogout: () => void
}

/** Where you are on the left; search, theme, notifications and your account on the right. */
export function Header({ user, unreadCount, onLogout }: HeaderProps) {
  const pathname = usePathname()

  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-hairline bg-surface/80 px-4 backdrop-blur sm:px-6 lg:px-8">
      <h2 className="min-w-[6rem] truncate text-sm font-medium text-ink-muted">{pageTitle(pathname)}</h2>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <NavbarSearch role={user?.role} />
        <ThemeToggle />
        <Link
          href="/dashboard/notifications"
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink"
          aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
          title="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-critical ring-2 ring-surface" />
          )}
        </Link>
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  )
}
