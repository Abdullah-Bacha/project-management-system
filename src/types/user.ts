export const USER_ROLES = ['admin', 'team_leader', 'developer'] as const
export type UserRole = (typeof USER_ROLES)[number]

export const USER_STATUSES = ['active', 'invited', 'suspended'] as const
export type UserStatus = (typeof USER_STATUSES)[number]

/** The user as the API returns it after login (never includes the password). */
export interface User {
  _id: string
  name: string
  email: string
  profilePicture?: string
  phone?: string
  role: UserRole
  status: UserStatus
  createdAt: string
  updatedAt: string
}

/** The few user fields the API populates onto projects, tasks, comments, etc. */
export interface UserSummary {
  _id: string
  name: string
  email: string
  profilePicture?: string
  phone?: string
  role?: UserRole
}

export interface AuthResponse {
  user: User
  token: string
  refreshToken: string
}
