'use client'

import { useState } from 'react'
import clsx from 'clsx'
import {
  CheckCircle2,
  ClipboardCheck,
  History,
  Link2,
  Unlink,
  MessageSquare,
  Paperclip,
  Play,
  Plus,
  RotateCcw,
  Undo2,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { StatsCard } from '@/components/ui/StatsCard'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { activityService } from '@/services/activity.service'
import { errorMessage } from '@/services/client'
import { describeActivity } from '@/lib/activity-text'
import { formatDateTime, timeAgo } from '@/lib/format'
import type { ActivityItem, ActivityPage, ActivityType } from '@/types'

const PAGE_SIZE = 20

const TYPE_STYLES: Record<ActivityType, { icon: typeof Plus; chip: string }> = {
  TASK_CREATED: { icon: Plus, chip: 'bg-brand-50 text-brand-700' },
  TASK_ASSIGNED: { icon: UserPlus, chip: 'bg-brand-50 text-brand-700' },
  TASK_STARTED: { icon: Play, chip: 'bg-info-subtle text-info-strong' },
  TASK_SUBMITTED_FOR_REVIEW: { icon: ClipboardCheck, chip: 'bg-accent-subtle text-accent-strong' },
  TASK_SENT_BACK: { icon: Undo2, chip: 'bg-caution-subtle text-caution-strong' },
  TASK_COMPLETED: { icon: CheckCircle2, chip: 'bg-positive-subtle text-positive-strong' },
  TASK_REOPENED: { icon: RotateCcw, chip: 'bg-caution-subtle text-caution-strong' },
  COMMENT_ADDED: { icon: MessageSquare, chip: 'bg-surface-sunken text-ink-muted' },
  ATTACHMENT_ADDED: { icon: Paperclip, chip: 'bg-surface-sunken text-ink-muted' },
  ATTACHMENT_DELETED: { icon: Trash2, chip: 'bg-surface-sunken text-ink-muted' },
  DEPENDENCY_ADDED: { icon: Link2, chip: 'bg-surface-sunken text-ink-muted' },
  DEPENDENCY_REMOVED: { icon: Unlink, chip: 'bg-surface-sunken text-ink-muted' },
}

function Entry({ item }: { item: ActivityItem }) {
  const { icon: Icon, chip } = TYPE_STYLES[item.type]
  const { actor, before, task, after } = describeActivity(item)

  return (
    <li className="flex items-start gap-3 px-4 py-2.5 sm:px-5">
      <Avatar name={item.actor?.name} size="sm" className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm text-ink-soft">
          <span className="font-medium text-ink">{actor}</span>
          {before}
          <span className="font-medium text-ink">&ldquo;{task}&rdquo;</span>
          {after}
        </p>
        <p className="mt-0.5 text-xs text-ink-faint" title={formatDateTime(item.createdAt)}>
          {timeAgo(item.createdAt)}
        </p>
      </div>
      <span className={clsx('mt-0.5 hidden h-6 w-6 shrink-0 items-center justify-center rounded-md sm:flex', chip)} aria-hidden="true">
        <Icon className="h-3.5 w-3.5" />
      </span>
    </li>
  )
}

/**
 * What has happened in this project, newest first. On the project page it is
 * one card (entry count and the latest line); opening it shows the feed.
 *
 * Details: What has happened in this project, newest first. The first page is live (the
 * server signals when a new entry is written and the page is re-read); older
 * entries load on request. Nothing here writes: entries come from the actions
 * themselves, on the server.
 */
export function ActivityFeed({ projectId }: { projectId: string }) {
  const { data, isLoading, error, errorStatus, refetch } = useRealtimeData<ActivityPage>({
    endpoint: `/api/projects/${projectId}/activity?limit=${PAGE_SIZE}`,
    watch: ['activities'],
    match: (signal) => signal.projectId === projectId,
  })

  const [open, setOpen] = useState(false)
  const [older, setOlder] = useState<ActivityItem[]>([])
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState('')

  // The live first page plus any older pages, each entry once (new activity
  // pushes entries down, so a page boundary can overlap).
  const seen = new Set<string>()
  const items = [...(data?.activities ?? []), ...older].filter((a) => !seen.has(a._id) && seen.add(a._id))
  const hasMore = olderHasMore ?? data?.hasMore ?? false

  const loadMore = async () => {
    setLoadingMore(true)
    setMoreError('')
    try {
      const page = await activityService.list(projectId, { skip: items.length, limit: PAGE_SIZE })
      setOlder((current) => [...current, ...page.activities])
      setOlderHasMore(page.hasMore)
    } catch (e) {
      setMoreError(errorMessage(e, 'Could not load more activity.'))
    } finally {
      setLoadingMore(false)
    }
  }

  const latest = items[0] ? describeActivity(items[0]) : null
  const hint = !data
    ? error
      ? 'Could not load, click to retry'
      : 'Loading…'
    : latest && items[0]
      ? `${latest.actor}${latest.before}“${latest.task}”${latest.after} · ${timeAgo(items[0].createdAt)}`
      : 'No activity yet'

  return (
    <>
      <StatsCard
        label="Recent activity"
        value={data ? `${items.length}${hasMore ? '+' : ''}` : '—'}
        hint={hint}
        icon={<History className="h-5 w-5" />}
        tone="brand"
        onClick={() => setOpen(true)}
      />

      {open && (
        <Modal title="Recent activity" placement="right" onClose={() => setOpen(false)}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isLoading && !data ? (
              <div className="space-y-3 p-4 sm:p-5" aria-busy="true" aria-label="Loading activity">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton h-9 rounded-lg" />
                ))}
              </div>
            ) : error && !data ? (
              <div>
                <ErrorState compact status={errorStatus} message="Unable to load activity." onRetry={refetch} />
              </div>
            ) : items.length === 0 ? (
              <EmptyState compact icon={<History className="h-6 w-6" />} title="No activity yet">
                Project activity will appear here as your team works.
              </EmptyState>
            ) : (
              <>
                <ul className="divide-y divide-hairline">
                  {items.map((item) => (
                    <Entry key={item._id} item={item} />
                  ))}
                </ul>

                {(hasMore || moreError) && (
                  <div className="flex flex-col items-center gap-2 border-t border-hairline px-4 py-3">
                    {moreError && <p className="text-xs text-critical-strong">{moreError}</p>}
                    <Button variant="secondary" size="sm" onClick={loadMore} isLoading={loadingMore}>
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  )
}
