'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import clsx from 'clsx'
import {
  LayoutDashboard,
  FolderKanban,
  Bell,
  LogOut,
  Search,
  ChevronsUpDown,
  Zap,
  Users,
  UsersRound,
  Users2,
  ClipboardList,
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'
import { notificationsService } from '@/services/notifications.service'
import { ROLE_LABELS, ROLE_BADGE_CLASSES } from '@/lib/roles'
import { UserRole } from '@/types'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/projects', label: 'Projects', icon: FolderKanban },
  { href: '/dashboard/notifications', label: 'Notifications', icon: Bell },
]

// Only rendered for role === 'admin' — user/team management is how an admin
// onboards team leaders and developers.
const adminNavItems = [
  { href: '/dashboard/admin/users', label: 'Users', icon: Users, exact: false },
  { href: '/dashboard/admin/teams', label: 'Teams', icon: UsersRound, exact: false },
  { href: '/dashboard/admin/reports', label: 'Reports', icon: ClipboardList, exact: false },
]

// team_leader and developer both belong to a team; they get a read-only
// view of their own roster instead of the admin-only directory above.
const teamNavItem = { href: '/dashboard/team', label: 'My Team', icon: Users2, exact: false }

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const token = useAuthStore((state) => state.token)
  const { user, logout } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    useAuthStore.getState().hydrate()
    if (!useAuthStore.getState().token) {
      router.push('/auth/login')
    }
  }, [router])

  useEffect(() => {
    if (!token) return
    notificationsService
      .getAll(0, 50)
      .then((data) => setUnreadCount(data.unreadCount ?? 0))
      .catch(() => setUnreadCount(0))
  }, [token, pathname])

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  const isAdmin = user?.role === 'admin'
  const isTeamMember = user?.role === 'team_leader' || user?.role === 'developer'

  const currentPage =
    [...navItems, ...adminNavItems, teamNavItem].find((item) =>
      isActive(item.href, item.exact)
    )?.label ?? 'Dashboard'

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-brand-600" />
          <p className="text-sm text-ink-muted">Loading your workspace…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-sunken">
      {/* Sidebar */}
      {/* Collapses to an icon-only rail below lg so content keeps its width. */}
      <aside className="flex w-16 shrink-0 flex-col border-r border-hairline bg-surface lg:w-64">
        <div className="flex h-16 items-center justify-center border-b border-hairline lg:justify-start lg:gap-2.5 lg:px-6">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-accent text-white">
            <Zap className="h-4.5 w-4.5" fill="currentColor" />
          </span>
          <Link
            href="/dashboard"
            className="hidden text-lg font-semibold tracking-tight text-ink lg:block"
          >
            TaskFlow
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2 lg:p-4">
          {navItems.map(({ href, label, icon: Icon, exact }) => (
            <SidebarLink
              key={href}
              href={href}
              label={label}
              icon={Icon}
              active={isActive(href, exact)}
              badge={href === '/dashboard/notifications' ? unreadCount : undefined}
            />
          ))}

          {isAdmin && (
            <>
              <p className="mt-4 hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint lg:block">
                Admin
              </p>
              <div className="my-2 h-px bg-hairline lg:hidden" />
              {adminNavItems.map(({ href, label, icon: Icon }) => (
                <SidebarLink
                  key={href}
                  href={href}
                  label={label}
                  icon={Icon}
                  active={isActive(href)}
                />
              ))}
            </>
          )}

          {isTeamMember && (
            <SidebarLink
              href={teamNavItem.href}
              label={teamNavItem.label}
              icon={teamNavItem.icon}
              active={isActive(teamNavItem.href)}
            />
          )}
        </nav>

        {/* User */}
        <div className="relative border-t border-hairline p-2 lg:p-3">
          {showUserMenu && (
            <>
              <button
                className="fixed inset-0 z-10 cursor-default"
                onClick={() => setShowUserMenu(false)}
                aria-label="Close menu"
              />
              <div className="animate-rise absolute bottom-full left-2 z-20 mb-2 w-56 overflow-hidden rounded-xl border border-hairline bg-surface shadow-lifted lg:left-3 lg:right-3 lg:w-auto">
                <div className="px-4 py-3">
                  <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
                  <p className="truncate text-xs text-ink-faint">{user?.email}</p>
                  {user?.role && (
                    <span
                      className={clsx(
                        'mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium',
                        ROLE_BADGE_CLASSES[user.role as UserRole]
                      )}
                    >
                      {ROLE_LABELS[user.role as UserRole] ?? user.role}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    logout()
                    setShowUserMenu(false)
                  }}
                  className="flex w-full items-center gap-2.5 border-t border-hairline px-4 py-3 text-sm font-medium text-critical transition-colors hover:bg-critical/6"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </>
          )}

          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            title={user?.name}
            className="flex w-full items-center justify-center rounded-xl p-2 text-left transition-colors hover:bg-surface-sunken lg:gap-3"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-accent text-sm font-semibold text-white">
              {user?.name?.charAt(0).toUpperCase()}
            </span>
            <span className="hidden min-w-0 flex-1 lg:block">
              <span className="block truncate text-sm font-medium text-ink">
                {user?.name}
              </span>
              <span className="block truncate text-xs text-ink-faint">
                {user?.email}
              </span>
              {user?.role && (
                <span
                  className={clsx(
                    'mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                    ROLE_BADGE_CLASSES[user.role as UserRole]
                  )}
                >
                  {ROLE_LABELS[user.role as UserRole] ?? user.role}
                </span>
              )}
            </span>
            <ChevronsUpDown className="hidden h-4 w-4 shrink-0 text-ink-faint lg:block" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-hairline bg-surface/80 px-4 backdrop-blur sm:px-8">
          <h2 className="text-sm font-medium text-ink-muted">{currentPage}</h2>

          <div className="flex items-center gap-2">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              aria-label="Search"
            >
              <Search className="h-4.5 w-4.5" />
            </button>
            <Link
              href="/dashboard/notifications"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
              aria-label="Notifications"
            >
              <Bell className="h-4.5 w-4.5" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-critical ring-2 ring-surface" />
              )}
            </Link>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  badge,
}: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  badge?: number
}) {
  return (
    <Link
      href={href}
      title={label}
      className={clsx(
        'group relative flex items-center justify-center rounded-xl py-2.5 text-sm font-medium',
        'lg:justify-start lg:gap-3 lg:px-3',
        'transition-all duration-200 ease-out',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 hidden h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-600 lg:block" />
      )}
      <span className="relative">
        <Icon
          className={clsx(
            'h-4.5 w-4.5 transition-transform duration-200',
            !active && 'group-hover:scale-110'
          )}
        />
        {/* Rail is too narrow for a count, so show a dot instead. */}
        {!!badge && (
          <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-critical ring-2 ring-surface lg:hidden" />
        )}
      </span>
      <span className="hidden lg:inline">{label}</span>
      {!!badge && (
        <span className="ml-auto hidden h-5 min-w-5 items-center justify-center rounded-full bg-critical px-1.5 text-[11px] font-semibold text-white lg:flex">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  )
}
