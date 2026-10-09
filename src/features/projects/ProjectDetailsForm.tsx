'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { PROJECT_STATUSES, type Project, type ProjectStatus } from '@/types'
import { errorMessage } from '@/services/client'

/** `<input type="date">` needs yyyy-MM-dd; the API returns an ISO string. */
function toDateInput(value?: string | null) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** Edit a project's content: title, description, requirements, status, deadline. */
export function ProjectDetailsForm({
  project,
  onSaved,
}: {
  project: Project
  onSaved: (updated: Project) => void
}) {
  // Initialised once — the project in context updates live, and that must
  // not overwrite what the user is typing.
  const [form, setForm] = useState({
    title: project.title ?? '',
    description: project.description ?? '',
    requirements: project.requirements ?? '',
    status: project.status ?? ('active' as ProjectStatus),
    deadline: toDateInput(project.deadline),
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const { notify, toastNode } = useToast()

  const handleSave = async () => {
    if (form.title.trim().length < 3) {
      setError('Title must be at least 3 characters')
      return
    }

    setError('')
    setSaving(true)
    try {
      const updated = await projectsService.update(project._id, {
        title: form.title.trim(),
        description: form.description,
        requirements: form.requirements,
        status: form.status,
        ...(form.deadline && { deadline: form.deadline }),
      })
      onSaved(updated)
      notify('success', 'Project updated')
    } catch (e) {
      notify('error', errorMessage(e, 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 space-y-5 rounded-card border border-hairline bg-surface p-6 shadow-card">
      <Input
        label="Project title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
        error={error}
      />

      <Textarea
        label="Description"
        id="project-description"
        rows={3}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />

      <Textarea
        label="Requirements"
        id="project-requirements"
        rows={3}
        value={form.requirements}
        onChange={(e) => setForm({ ...form, requirements: e.target.value })}
      />

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Select
          label="Status"
          id="project-status"
          value={form.status}
          className="capitalize"
          onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}
        >
          {PROJECT_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s}
            </option>
          ))}
        </Select>

        <Input
          label="Deadline"
          type="date"
          value={form.deadline}
          onChange={(e) => setForm({ ...form, deadline: e.target.value })}
        />
      </div>

      <div className="border-t border-hairline pt-5">
        <Button onClick={handleSave} isLoading={saving} icon={<Save className="h-4 w-4" />}>
          Save changes
        </Button>
      </div>

      {toastNode}
    </section>
  )
}
