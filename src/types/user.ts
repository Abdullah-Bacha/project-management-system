export type UserRole = 'admin' | 'team_leader' | 'developer'
export type UserStatus = 'active' | 'invited' | 'suspended'

export interface User {
  _id: string
  name: string
  email: string
  password?: string
  profilePicture?: string
  role: UserRole
  status: UserStatus
  createdAt: Date
  updatedAt: Date
  socketId?: string
}

export interface UserInput {
  name: string
  email: string
  password: string
  profilePicture?: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface AuthResponse {
  user: Omit<User, 'password'>
  token: string
  refreshToken: string
}
