import {
  LayoutDashboard,
  FolderKanban,
  ListChecks,
  Bell,
  Users,
  UsersRound,
  Users2,
  ClipboardList,
} from 'lucide-react'
import type { UserRole } from '@/types'

export interface NavItem {
  href: string
  label: string
  icon: typeof LayoutDashboard
  /** Match the path exactly (otherwise any sub-path is active too). */
  exact?: boolean
}

export interface NavGroup {
  id: 'workspace' | 'insights' | 'admin'
  label: string
  items: NavItem[]
}

const dashboard: NavItem = { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true }
const projects: NavItem = { href: '/dashboard/projects', label: 'Projects', icon: FolderKanban }
const myTasks: NavItem = { href: '/dashboard/tasks', label: 'My Tasks', icon: ListChecks }
const myTeam: NavItem = { href: '/dashboard/team', label: 'My Team', icon: Users2 }
const notifications: NavItem = { href: '/dashboard/notifications', label: 'Notifications', icon: Bell }
const reports: NavItem = { href: '/dashboard/admin/reports', label: 'Reports', icon: ClipboardList }
const users: NavItem = { href: '/dashboard/admin/users', label: 'Users', icon: Users }
const teams: NavItem = { href: '/dashboard/admin/teams', label: 'Teams', icon: UsersRound }

const ALL_ITEMS = [dashboard, projects, myTasks, myTeam, notifications, reports, users, teams]

export const NOTIFICATIONS_HREF = notifications.href

/**
 * The navigation a role is shown, in groups. This only decides what is
 * *displayed*; the pages and APIs enforce access on the server regardless.
 * Empty groups are left out, so a developer never sees INSIGHTS or ADMIN, and a team leader never sees ADMIN.
 */
export function navFor(role?: UserRole): NavGroup[] {
  const isAdmin = role === 'admin'
  const isTeamMember = role === 'team_leader' || role === 'developer'
  // Reports follow Team Workload's policy: administrators, and team leaders for what they lead.
  const seesReports = isAdmin || role === 'team_leader'

  const groups: NavGroup[] = [
    {
      id: 'workspace',
      label: 'Workspace',
      items: [dashboard, projects, ...(isAdmin ? [] : [myTasks]), ...(isTeamMember || isAdmin ? [myTeam] : []), notifications],
    },
    { id: 'insights', label: 'Insights', items: seesReports ? [reports] : [] },
    { id: 'admin', label: 'Admin', items: isAdmin ? [users, teams] : [] },
  ]

  return groups.filter((group) => group.items.length > 0)
}

export function isActive(pathname: string, { href, exact }: NavItem) {
  return exact ? pathname === href : pathname.startsWith(href)
}

/** The page name shown in the header. */
export function pageTitle(pathname: string) {
  return ALL_ITEMS.find((item) => isActive(pathname, item))?.label ?? 'Dashboard'
}
