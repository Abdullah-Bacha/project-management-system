import { PriorityBadge } from '@/components/ui/StatusBadge'
import type { TaskBlueprint } from '@/types'

interface TemplatePreviewProps {
  name?: string
  category?: string
  description?: string
  projectDescription?: string
  requirements?: string
  tasks: TaskBlueprint[]
}

/** How a task's due offset reads: "Due on day 0 / 3 days after start". */
export function offsetLabel(days?: number) {
  if (days === undefined) return 'No due date'
  if (days === 0) return 'Due on the start day'
  return `Due ${days} ${days === 1 ? 'day' : 'days'} after start`
}

/** What a template will create: project details and every task, in order. Pure display. */
export function TemplatePreview({ name, category, description, projectDescription, requirements, tasks }: TemplatePreviewProps) {
  return (
    <div className="space-y-4">
      {(name || category || description) && (
        <div>
          {name && <h3 className="break-words font-semibold text-ink">{name}</h3>}
          {category && (
            <span className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700">{category}</span>
          )}
          {description && <p className="mt-1 break-words text-sm text-ink-muted">{description}</p>}
        </div>
      )}

      {(projectDescription || requirements) && (
        <dl className="space-y-3 rounded-xl border border-hairline bg-surface-sunken/50 p-4 text-sm">
          {projectDescription && (
            <div>
              <dt className="text-xs font-medium text-ink-muted">Project description</dt>
              <dd className="mt-0.5 whitespace-pre-line break-words text-ink-soft">{projectDescription}</dd>
            </div>
          )}
          {requirements && (
            <div>
              <dt className="text-xs font-medium text-ink-muted">Requirements</dt>
              <dd className="mt-0.5 whitespace-pre-line break-words text-ink-soft">{requirements}</dd>
            </div>
          )}
        </dl>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-ink">
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} will be created
        </p>
        {tasks.length === 0 ? (
          <p className="rounded-xl bg-surface-sunken px-4 py-5 text-center text-sm text-ink-muted">
            This template has no tasks. The project will start empty.
          </p>
        ) : (
          <ol className="space-y-2">
            {tasks.map((t, i) => (
              <li key={i} className="rounded-xl border border-hairline p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 break-words text-sm font-medium text-ink">
                    <span className="mr-2 text-ink-faint tabular-nums">{i + 1}.</span>
                    {t.title}
                  </p>
                  <PriorityBadge priority={t.priority} />
                </div>
                {t.description && <p className="mt-1 whitespace-pre-line break-words text-xs text-ink-muted">{t.description}</p>}
                <p className="mt-1.5 text-xs text-ink-faint">To Do · {offsetLabel(t.dueOffsetDays)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
