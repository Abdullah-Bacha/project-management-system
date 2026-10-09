import { FileText, FolderKanban, ListChecks, Plus, UserPlus, UsersRound } from 'lucide-react'
import { ButtonLink } from '@/components/ui/ButtonLink'
import type { UserRole } from '@/types'

interface QuickAction {
  href: string
  label: string
  icon: typeof Plus
  primary?: boolean
}

/**
 * Shortcuts to things each role can actually do, using routes that already
 * exist. Hiding a shortcut is only a convenience: the pages and APIs behind
 * these links still enforce permissions on the server.
 */
function actionsFor(role?: UserRole): QuickAction[] {
  switch (role) {
    case 'admin':
      return [
        { href: '/dashboard/projects/new', label: 'New Project', icon: Plus, primary: true },
        { href: '/dashboard/admin/teams', label: 'Manage Teams', icon: UsersRound },
        { href: '/dashboard/admin/users', label: 'Manage Users', icon: UserPlus },
        { href: '/dashboard/admin/reports', label: 'View Reports', icon: FileText },
      ]
    case 'team_leader':
      return [
        { href: '/dashboard/tasks', label: 'My Tasks', icon: ListChecks, primary: true },
        { href: '/dashboard/projects', label: 'Open Projects', icon: FolderKanban },
        { href: '/dashboard/team', label: 'My Team', icon: UsersRound },
      ]
    case 'developer':
      return [
        { href: '/dashboard/tasks', label: 'My Tasks', icon: ListChecks, primary: true },
        { href: '/dashboard/team', label: 'My Team', icon: UsersRound },
      ]
    default:
      return []
  }
}

export function QuickActions({ role }: { role?: UserRole }) {
  const actions = actionsFor(role)
  if (actions.length === 0) return null

  return (
    <nav aria-label="Quick actions" className="flex flex-wrap items-center gap-2">
      {actions.map(({ href, label, icon: Icon, primary }) => (
        <ButtonLink
          key={href}
          href={href}
          size="sm"
          variant={primary ? 'primary' : 'secondary'}
          icon={<Icon className="h-4 w-4" />}
        >
          {label}
        </ButtonLink>
      ))}
    </nav>
  )
}
