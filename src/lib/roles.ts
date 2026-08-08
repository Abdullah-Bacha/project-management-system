import { UserRole } from '@/types'

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  team_leader: 'Team Leader',
  developer: 'Developer',
}

export const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  admin: 'bg-caution/12 text-caution',
  team_leader: 'bg-accent/12 text-accent',
  developer: 'bg-surface-sunken text-ink-muted',
}

/** Single source of truth for the role enum — reused by admin API routes too. */
export const ASSIGNABLE_ROLES: UserRole[] = ['admin', 'team_leader', 'developer']
