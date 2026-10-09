import type { ActivityItem } from '@/types'

/**
 * The sentence for one feed entry, in plain words. Shared by the feed UI and
 * its tests. The task title is returned separately so the UI can emphasise it.
 */
export function describeActivity(item: ActivityItem): { actor: string; before: string; task: string; after: string } {
  const actor = item.actor?.name ?? 'Someone'
  const task = item.task?.title ?? 'a deleted task'
  const to = item.assignee?.name
  const related = item.relatedTask?.title ?? 'a deleted task'

  const parts: Record<ActivityItem['type'], [string, string]> = {
    TASK_CREATED: [' created ', to ? ` and assigned it to ${to}` : ''],
    TASK_ASSIGNED: [' assigned ', to ? ` to ${to}` : ''],
    TASK_STARTED: [' started ', ''],
    TASK_SUBMITTED_FOR_REVIEW: [' submitted ', ' for review'],
    TASK_SENT_BACK: [' sent ', to ? ` back to ${to}` : ' back'],
    TASK_COMPLETED: [' completed ', ''],
    TASK_REOPENED: [' reopened ', ''],
    COMMENT_ADDED: [' commented on ', ''],
    ATTACHMENT_ADDED: [` attached "${item.fileName ?? 'a file'}" to `, ''],
    ATTACHMENT_DELETED: [` removed "${item.fileName ?? 'a file'}" from `, ''],
    // task = the blocked task; related = the one that blocks it.
    DEPENDENCY_ADDED: [` made "${related}" a blocker for `, ''],
    DEPENDENCY_REMOVED: [` removed the dependency between "${related}" and `, ''],
  }
  const [before, after] = parts[item.type]
  return { actor, before, task, after }
}

/** The sentence as one plain string. */
export function activitySentence(item: ActivityItem): string {
  const { actor, before, task, after } = describeActivity(item)
  return `${actor}${before}"${task}"${after}`
}
