import { USER_ROLES, type UserRole } from '@/types'

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  team_leader: 'Team Leader',
  developer: 'Developer',
}

/** Badge colours come from the role-* design tokens (see globals.css). */
export const ROLE_BADGE_CLASSES: Record<UserRole, string> = {
  admin: 'bg-role-admin-subtle text-role-admin',
  team_leader: 'bg-role-leader-subtle text-role-leader',
  developer: 'bg-role-developer-subtle text-role-developer',
}

/** Roles an admin can choose when creating or editing a user. */
export const ASSIGNABLE_ROLES: readonly UserRole[] = USER_ROLES
