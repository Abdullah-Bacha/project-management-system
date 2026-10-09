'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FolderPlus } from 'lucide-react'
import { templatesService } from '@/services/templates.service'
import { teamsService } from '@/services/admin.service'
import { errorMessage } from '@/services/client'
import { useLoad } from '@/hooks/useLoad'
import { localToday } from '@/lib/due-date'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import type { ProjectTemplate } from '@/types'
import { TemplatePreview } from './TemplatePreview'

/** Pick the new project's details, see exactly which tasks will be made, then create it. */
export function UseTemplateModal({ template, onClose }: { template: ProjectTemplate; onClose: () => void }) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState(template.projectDescription ?? '')
  const [requirements, setRequirements] = useState(template.requirements ?? '')
  const [startDate, setStartDate] = useState('')
  const [deadline, setDeadline] = useState('')
  const [teamId, setTeamId] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // One id per open dialog: if the request is sent twice (double click, retry
  // after a dropped connection) the server returns the first project.
  const requestId = useRef(globalThis.crypto?.randomUUID?.() ?? `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)

  const teams = useLoad(() => teamsService.list(), [])

  const validate = () => {
    const next: Record<string, string> = {}
    if (title.trim().length < 3) next.title = title.trim() ? 'Title must be at least 3 characters' : 'Project title is required'
    if (startDate && deadline && deadline < startDate) next.deadline = 'Deadline cannot be before the start date'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const create = async () => {
    if (creating || !validate()) return
    setCreating(true)
    setApiError(null)
    try {
      const result = await templatesService.use(template._id, {
        title: title.trim(),
        description,
        requirements,
        ...(startDate && { startDate }),
        ...(deadline && { deadline }),
        ...(teamId && { teamId }),
        today: localToday(),
        requestId: requestId.current,
      })
      router.push(`/dashboard/projects/${result.project._id}`)
    } catch (e) {
      setApiError(errorMessage(e, 'Could not create the project'))
      setCreating(false)
    }
  }

  return (
    <Modal title="Create project from template" placement="right" onClose={creating ? () => {} : onClose}>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
        {apiError && (
          <p role="alert" className="rounded-lg bg-critical-subtle px-3 py-2 text-sm text-critical-strong">
            {apiError}
          </p>
        )}

        <form
          id="use-template-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
          className="space-y-4"
        >
          <Input label="Project title" name="use-title" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={120} placeholder={template.name} autoFocus />
          <Textarea label="Description" name="use-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          <Textarea label="Requirements" name="use-requirements" rows={2} value={requirements} onChange={(e) => setRequirements(e.target.value)} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Start date" name="use-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <Input label="Deadline" name="use-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} error={errors.deadline} />
          </div>
          <Select label="Team" name="use-team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Assign later</option>
            {teams.data?.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} — led by {t.teamLeader?.name}
              </option>
            ))}
          </Select>
          {teams.error && <p className="-mt-2 text-xs text-critical-strong">Could not load teams — you can assign one later in project settings.</p>}
        </form>

        <div className="border-t border-hairline pt-4">
          <p className="mb-3 text-xs text-ink-muted">
            {template.tasks.some((t) => t.dueOffsetDays !== undefined)
              ? 'Due dates count from the start date above, or from today if you leave it empty.'
              : 'Tasks start in To Do with no assignee.'}
          </p>
          <TemplatePreview tasks={template.tasks} />
        </div>
      </div>

      <footer className="flex shrink-0 gap-3 border-t border-hairline p-4">
        <Button type="button" variant="secondary" onClick={onClose} disabled={creating}>
          Cancel
        </Button>
        <Button type="button" onClick={() => void create()} isLoading={creating} icon={<FolderPlus className="h-4 w-4" />} className="flex-1">
          Create project{template.tasks.length ? ` & ${template.tasks.length} ${template.tasks.length === 1 ? 'task' : 'tasks'}` : ''}
        </Button>
      </footer>
    </Modal>
  )
}
