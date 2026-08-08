export interface Comment {
  _id: string
  taskId: string
  userId: string
  text: string
  attachments?: string[]
  likes: string[]
  createdAt: Date
  updatedAt: Date
}

export interface CommentInput {
  text: string
  attachments?: string[]
}
