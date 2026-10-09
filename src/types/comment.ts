import type { UserSummary } from './user'

export interface Comment {
  _id: string
  taskId: string
  userId: UserSummary
  text: string
  createdAt: string
}
