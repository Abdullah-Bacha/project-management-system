import { User } from './user'

export type ProjectStatus = 'active' | 'archived' | 'completed'

export interface Project {
  _id: string
  title: string
  description?: string
  requirements?: string
  owner: string | User
  team?: string | Team
  members: (string | User)[]
  status: ProjectStatus
  color: string
  startDate?: Date
  deadline?: Date
  progress: number
  createdAt: Date
  updatedAt: Date
}

export interface ProjectInput {
  title: string
  description?: string
  requirements?: string
  startDate?: Date
  deadline?: Date
  teamId?: string
}

export interface ProjectUpdateInput {
  title?: string
  description?: string
  status?: ProjectStatus
  deadline?: Date
}

export interface Team {
  _id: string
  name: string
  description?: string
  teamLeader: string | User
  members: (string | User)[]
  createdBy: string | User
  createdAt: Date
  updatedAt: Date
}
