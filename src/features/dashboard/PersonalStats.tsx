import { AlertTriangle, CheckCircle2, ClipboardCheck, ListChecks, Play } from 'lucide-react'
import { StatsCard } from '@/components/ui/StatsCard'
import type { MyTasksPage } from '@/types'
import type { TaskStat } from './TaskStatDrawer'

interface PersonalStatsProps {
  counts: MyTasksPage['counts']
  open: number
  overdue: number
  ready: boolean
  /** Called with the card that was opened; when absent the cards are plain numbers. */
  onSelect?: (stat: TaskStat) => void
}

/** The developer's own numbers, from the tasks assigned to them, never project-wide totals. */
export function PersonalStats({ counts, open, overdue, ready, onSelect }: PersonalStatsProps) {
  if (!ready) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5" aria-busy="true" aria-label="Loading your numbers">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton h-28 rounded-card" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
      <StatsCard label="My Tasks" value={open} hint="open, assigned to you" icon={<ListChecks className="h-5 w-5" />} tone="brand" delay={0.02} onClick={onSelect && (() => onSelect('open'))} />
      <StatsCard label="In Progress" value={counts['in-progress']} hint="you are working on" icon={<Play className="h-5 w-5" />} tone="brand" delay={0.06} onClick={onSelect && (() => onSelect('in-progress'))} />
      <StatsCard label="Waiting for Review" value={counts.review} hint="with your team leader" icon={<ClipboardCheck className="h-5 w-5" />} tone="caution" delay={0.1} onClick={onSelect && (() => onSelect('review'))} />
      <StatsCard label="Completed" value={counts.complete} hint="approved by your leader" icon={<CheckCircle2 className="h-5 w-5" />} tone="positive" delay={0.14} onClick={onSelect && (() => onSelect('complete'))} />
      <StatsCard
        label="Overdue"
        value={overdue}
        hint={overdue > 0 ? 'past their due date' : 'nothing overdue'}
        icon={<AlertTriangle className="h-5 w-5" />}
        tone={overdue > 0 ? 'critical' : 'positive'}
        delay={0.18}
        onClick={onSelect && (() => onSelect('overdue'))}
      />
    </div>
  )
}
