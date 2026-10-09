import { Crown, UsersRound } from 'lucide-react'
import type { Project } from '@/types'

/** Project context under the title: who leads it, who works on it, how far along it is. */
export function ProjectPeople({ project }: { project: Project }) {
  const leaderId = project.team?.teamLeader?._id
  const developers = (project.team?.members ?? []).filter((m) => m._id !== leaderId)

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      {project.team ? (
        <>
          <span className="inline-flex items-center gap-1.5 text-ink-muted">
            <Crown className="h-3.5 w-3.5 text-caution" />
            Team leader
            <span className="font-medium text-ink">{project.team.teamLeader?.name ?? 'Unassigned'}</span>
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-ink-muted">
            <UsersRound className="h-3.5 w-3.5" />
            Developers
            <span className="truncate font-medium text-ink">
              {developers.length > 0 ? developers.map((d) => d.name).join(', ') : 'None yet'}
            </span>
          </span>
        </>
      ) : (
        <span className="rounded-full bg-caution-subtle px-2.5 py-1 text-xs font-medium text-caution-strong">
          No team assigned. An admin assigns one in Settings.
        </span>
      )}

      <span className="inline-flex items-center gap-2 text-ink-muted">
        Progress
        <span
          className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-sunken"
          role="progressbar"
          aria-valuenow={project.progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Project progress"
        >
          <span className="block h-full rounded-full bg-interactive" style={{ width: `${project.progress}%` }} />
        </span>
        <span className="font-medium tabular-nums text-ink">{project.progress}%</span>
      </span>
    </div>
  )
}
