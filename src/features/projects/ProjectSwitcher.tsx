'use client'

import Link from 'next/link'
import clsx from 'clsx'
import { useRealtimeProjects } from './useRealtimeProjects'

/** Chips for moving between the user's projects' boards; hidden when there is only one. */
export function ProjectSwitcher({ currentId }: { currentId: string }) {
  const { projects } = useRealtimeProjects()
  if (projects.length < 2) return null

  return (
    <nav aria-label="My projects" className="mb-4 flex shrink-0 gap-1.5 overflow-x-auto pb-1">
      {projects.map((p) => (
        <Link
          key={p._id}
          href={`/dashboard/projects/${p._id}`}
          aria-current={p._id === currentId ? 'page' : undefined}
          className={clsx(
            'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors',
            p._id === currentId
              ? 'bg-interactive text-on-brand'
              : 'bg-surface-sunken text-ink-muted hover:bg-hairline'
          )}
        >
          {p.title}
        </Link>
      ))}
    </nav>
  )
}
