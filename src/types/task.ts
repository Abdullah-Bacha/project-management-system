export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'complete'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Subtask {
  _id: string
  title: string
  completed: boolean
}

export interface TaskAttachment {
  name: string
  url: string
  uploadedAt: Date
}

export interface Task {
  _id: string
  projectId: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  assignedTo?: string
  createdBy: string
  tags?: string[]
  attachments?: TaskAttachment[]
  startDate?: Date
  dueDate?: Date
  estimatedHours?: number
  actualHours: number
  subtasks?: Subtask[]
  order: number
  createdAt: Date
  updatedAt: Date
}

export interface TaskInput {
  title: string
  description?: string
  priority: TaskPriority
  assignedTo?: string
  dueDate?: Date
  estimatedHours?: number
  tags?: string[]
}

export interface TaskUpdateInput {
  title?: string
  description?: string
  priority?: TaskPriority
  status?: TaskStatus
  dueDate?: Date
  actualHours?: number
  assignedTo?: string
}
