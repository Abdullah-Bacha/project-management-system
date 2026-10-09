'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Link2, Save, UserCog } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { teamsService } from '@/services/admin.service'
import { errorMessage } from '@/services/client'
import { useLoad } from '@/hooks/useLoad'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { PROJECT_STATUSES, type Project, type ProjectStatus } from '@/types'
import { ProjectFilesSection } from './ProjectFilesSection'
import { ReferenceLinksEditor, linkErrors, newLinkRow, rowsToLinks, type LinkRow } from './ReferenceLinksEditor'

/** `<input type="date">` needs yyyy-MM-dd; the API returns an ISO string (a due day, so its UTC day is the day). */
const toDateInput = (value?: string | null) => {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * Edit a project from the projects list: its details, dates, status, the team
 * staffed on it, its reference links and its files, in one place. Tasks and
 * members are managed inside the project. The form's fields are saved with
 * "Save changes" (only what changed is sent); files are saved as soon as they
 * are added or removed.
 */
export function EditProjectModal({ project, onClose, onSaved }: { project: Project; onClose: () => void; onSaved: (project: Project) => void }) {
  const teams = useLoad(() => teamsService.list(), [])
  const original = {
    title: project.title ?? '',
    description: project.description ?? '',
    requirements: project.requirements ?? '',
    status: project.status,
    startDate: toDateInput(project.startDate),
    deadline: toDateInput(project.deadline),
    teamId: project.team?._id ?? '',
  }
  const [form, setForm] = useState(original)
  const [links, setLinks] = useState<LinkRow[]>(() => (project.referenceLinks ?? []).map((l) => newLinkRow(l)))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [linkProblems, setLinkProblems] = useState<Record<number, string>>({})
  const [apiError, setApiError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (patch: Partial<typeof form>) => setForm((cur) => ({ ...cur, ...patch }))

  const save = async () => {
    if (saving) return
    setApiError('')

    const next: Record<string, string> = {}
    if (form.title.trim().length < 3) next.title = form.title.trim() ? 'Title must be at least 3 characters' : 'Project title is required'
    if (form.startDate && form.deadline && form.deadline < form.startDate) next.deadline = 'Deadline cannot be before the start date'
    const problems = linkErrors(links)
    setErrors(next)
    setLinkProblems(problems)
    if (Object.keys(next).length > 0 || Object.keys(problems).length > 0) return

    const newLinks = rowsToLinks(links)
    const linksChanged = JSON.stringify(newLinks) !== JSON.stringify(project.referenceLinks ?? [])
    const changes = {
      ...(form.title.trim() !== original.title && { title: form.title.trim() }),
      ...(form.description !== original.description && { description: form.description }),
      ...(form.requirements !== original.requirements && { requirements: form.requirements }),
      ...(form.status !== original.status && { status: form.status }),
      ...(form.startDate !== original.startDate && { startDate: form.startDate || null }),
      ...(form.deadline !== original.deadline && { deadline: form.deadline || null }),
      ...(linksChanged && { referenceLinks: newLinks }),
    }
    const teamChanged = form.teamId !== original.teamId
    if (Object.keys(changes).length === 0 && !teamChanged) return onClose()

    setSaving(true)
    let updated: Project = project
    try {
      if (Object.keys(changes).length > 0) updated = await projectsService.update(project._id, changes)
    } catch (e) {
      setApiError(errorMessage(e, 'Could not save the project'))
      setSaving(false)
      return
    }
    try {
      if (teamChanged) updated = await projectsService.assign(project._id, { teamId: form.teamId || null })
    } catch (e) {
      // The details were saved; only the staffing was not.
      setApiError(`The project details were saved, but the team could not be changed: ${errorMessage(e, 'please try again')}`)
      setSaving(false)
      return
    }
    onSaved(updated)
  }

  return (
    <Modal title="Edit project" placement="right" onClose={saving ? () => {} : onClose}>
      <form
        id="edit-project-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5"
      >
        {apiError && (
          <p role="alert" className="rounded-lg bg-critical-subtle px-3 py-2 text-sm text-critical-strong">
            {apiError}
          </p>
        )}

        <Input label="Project title" value={form.title} onChange={(e) => set({ title: e.target.value })} error={errors.title} maxLength={100} />
        <Textarea label="Description" id="edit-project-description" rows={3} value={form.description} maxLength={500} onChange={(e) => set({ description: e.target.value })} />
        <Textarea label="Requirements" id="edit-project-requirements" rows={3} value={form.requirements} onChange={(e) => set({ requirements: e.target.value })} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select label="Status" id="edit-project-status" value={form.status} className="capitalize" onChange={(e) => set({ status: e.target.value as ProjectStatus })}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </Select>
          <Input label="Start date" type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />
          <Input label="Deadline" type="date" value={form.deadline} onChange={(e) => set({ deadline: e.target.value })} error={errors.deadline} />
        </div>

        <section className="space-y-2 rounded-xl border border-hairline bg-surface-sunken/50 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <UserCog className="h-4 w-4 text-interactive" />
            Staffing
          </h3>
          <p className="text-xs text-ink-muted">The team that runs this project. Its leader manages it day to day, and its developers get access.</p>
          <Select label="Team" value={form.teamId} onChange={(e) => set({ teamId: e.target.value })}>
            <option value="">Unassigned</option>
            {teams.data?.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name} — led by {t.teamLeader?.name}
              </option>
            ))}
          </Select>
          {teams.error && <p className="text-xs text-critical-strong">Could not load teams.</p>}
        </section>

        <section className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Link2 className="h-4 w-4 text-ink-faint" />
            Reference links
          </h3>
          <ReferenceLinksEditor rows={links} onChange={setLinks} errors={linkProblems} />
        </section>

        <ProjectFilesSection projectId={project._id} />

        <section>
          <Link href={`/dashboard/projects/${project._id}`} className="inline-flex items-center gap-1.5 text-xs font-medium text-interactive hover:text-interactive-hover">
            Manage tasks and members in the project
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </section>
      </form>

      <footer className="flex shrink-0 gap-3 border-t border-hairline p-4">
        <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" form="edit-project-form" isLoading={saving} icon={<Save className="h-4 w-4" />} className="flex-1">
          Save changes
        </Button>
      </footer>
    </Modal>
  )
}
