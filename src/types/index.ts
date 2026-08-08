export * from './user'
export * from './project'
export * from './task'
export * from './comment'
export * from './notification'

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface ApiErrorResponse {
  message: string
  statusCode: number
  errors?: Record<string, string[]>
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  skip: number
  limit: number
}
