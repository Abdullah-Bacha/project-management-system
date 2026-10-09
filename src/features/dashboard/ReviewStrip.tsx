import Link from 'next/link'
import { ArrowRight, ClipboardCheck } from 'lucide-react'

export interface ReviewItem {
  projectId: string
  projectTitle: string
  count: number
}

/** The team leader's first question: what needs my decision? Links to each project's Work page. */
export function ReviewStrip({ items }: { items: ReviewItem[] }) {
  const total = items.reduce((sum, i) => sum + i.count, 0)
  if (total === 0) return null

  return (
    <section
      aria-label="Waiting for your review"
      className="animate-rise rounded-card border border-accent/30 bg-accent-subtle/40 p-4 sm:p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-accent-strong">
        <ClipboardCheck className="h-4 w-4" />
        {total} {total === 1 ? 'task' : 'tasks'} waiting for your review
      </h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items
          .filter((i) => i.count > 0)
          .map((i) => (
            <li key={i.projectId}>
              <Link
                href={`/dashboard/projects/${i.projectId}`}
                className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-surface px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-sunken"
              >
                {i.projectTitle}
                <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-accent-strong tabular-nums">{i.count}</span>
                <ArrowRight className="h-3.5 w-3.5 text-ink-faint" />
              </Link>
            </li>
          ))}
      </ul>
    </section>
  )
}
