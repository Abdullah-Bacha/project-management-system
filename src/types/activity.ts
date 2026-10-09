/** The few project events worth showing the team. Everything else is deliberately not recorded. */
export const ACTIVITY_TYPES = [
  'TASK_CREATED',
  'TASK_ASSIGNED',
  'TASK_STARTED',
  'TASK_SUBMITTED_FOR_REVIEW',
  'TASK_SENT_BACK',
  'TASK_COMPLETED',
  'TASK_REOPENED',
  'COMMENT_ADDED',
  'ATTACHMENT_ADDED',
  'ATTACHMENT_DELETED',
  'DEPENDENCY_ADDED',
  'DEPENDENCY_REMOVED',
] as const
export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/** One entry of a project's activity feed, as GET /api/projects/:id/activity returns it. */
export interface ActivityItem {
  _id: string
  type: ActivityType
  createdAt: string
  actor: { _id: string; name: string; profilePicture?: string } | null
  /** The task concerned; null for a non-task event, or when the task no longer exists. */
  task: { _id: string; title: string } | null
  /** For dependency entries: the task that blocks `task`. */
  relatedTask?: { _id: string; title: string } | null
  /** The developer the event concerns (assigned to, sent back to…), when there is one. */
  assignee: { _id: string; name: string } | null
  /** For attachment entries: the file's name (nothing else about it is kept). */
  fileName?: string
}

export interface ActivityPage {
  activities: ActivityItem[]
  /** True when there are older activities than the ones returned. */
  hasMore: boolean
}
