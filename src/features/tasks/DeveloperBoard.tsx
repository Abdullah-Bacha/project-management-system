import Link from 'next/link'
import { UserRound } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/PageState'
import type { Task, TaskStatus, UserSummary } from '@/types'

export const UNASSIGNED = 'unassigned'

export interface BoardPerson {
  /** A user id, or UNASSIGNED for tasks nobody has been given. */
  id: string
  name: string
  tasks: Task[]
}

/**
 * Who appears on a project's board: its developers, anyone else who currently
 * holds a task, and an "Unassigned" card only when there are loose tasks.
 */
export function boardPeople(members: UserSummary[], tasks: Task[]): BoardPerson[] {
  const byId = new Map<string, BoardPerson>()
  const add = (id: string, name: string) => {
    if (!byId.has(id)) byId.set(id, { id, name, tasks: [] })
  }

  for (const m of members) if (m.role === 'developer') add(m._id, m.name)
  for (const t of tasks) if (t.assignedTo) add(t.assignedTo._id, t.assignedTo.name)

  for (const t of tasks) {
    if (t.assignedTo) byId.get(t.assignedTo._id)!.tasks.push(t)
  }

  const people = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))

  const loose = tasks.filter((t) => !t.assignedTo)
  if (loose.length > 0) people.push({ id: UNASSIGNED, name: 'Unassigned', tasks: loose })

  return people
}

const count = (tasks: Task[], status: TaskStatus) => tasks.filter((t) => t.status === status).length

const STATS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To Do' },
  { status: 'in-progress', label: 'In Progress' },
  { status: 'review', label: 'In Review' },
  { status: 'complete', label: 'Complete' },
]

/** The team leader's starting point: one card per developer with their task counts. */
export function DeveloperBoard({
  projectId,
  people,
}: {
  projectId: string
  people: BoardPerson[]
}) {
  if (people.length === 0) {
    return (
      <EmptyState icon={<UserRound className="h-6 w-6" />} title="No developers on this project yet">
        Developers appear here once the project&apos;s team has members. An admin assigns the team in
        the project&apos;s settings.
      </EmptyState>
    )
  }

  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {people.map((person, i) => (
        <li key={person.id} className="animate-rise" style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}>
          <Link
            href={`/dashboard/projects/${projectId}?developer=${person.id}`}
            className="block rounded-card border border-hairline bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lifted"
          >
            <div className="flex items-center gap-3">
              {person.id === UNASSIGNED ? (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-ink-muted">
                  <UserRound className="h-5 w-5" />
                </span>
              ) : (
                <Avatar name={person.name} size="lg" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{person.name}</p>
                <p className="text-xs text-ink-muted">
                  {person.tasks.length === 0
                    ? 'No tasks yet'
                    : `${person.tasks.length} task${person.tasks.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>

            <dl className="mt-4 grid grid-cols-4 gap-2 border-t border-hairline pt-4 text-center">
              {STATS.map(({ status, label }) => (
                <div key={status}>
                  <dd className="text-lg font-semibold tabular-nums text-ink">{count(person.tasks, status)}</dd>
                  <dt className="text-[11px] leading-tight text-ink-muted">{label}</dt>
                </div>
              ))}
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  )
}
