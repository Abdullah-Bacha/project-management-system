'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FolderPlus, ClipboardList, ShieldAlert, LayoutTemplate, Link2, Paperclip } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { teamsService } from '@/services/admin.service'
import { projectResourcesService } from '@/services/project-files.service'
import { ReferenceLinksEditor, linkErrors, newLinkRow, rowsToLinks, type LinkRow } from '@/features/projects/ReferenceLinksEditor'
import { PendingFilesPicker } from '@/features/projects/PendingFilesPicker'
import { useAuth } from '@/hooks/useAuth'
import { useLoad } from '@/hooks/useLoad'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { errorMessage } from '@/services/client'

export default function NewProjectPage() {
  const router = useRouter()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    requirements: '',
    startDate: '',
    deadline: '',
    teamId: '',
  })
  const [loading, setLoading] = useState(false)
  const [linkRows, setLinkRows] = useState<LinkRow[]>([])
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [linkProblems, setLinkProblems] = useState<Record<number, string>>({})
  const [errors, setErrors] = useState({ title: '', deadline: '' })
  const { notify, toastNode } = useToast()

  // Only admins can create projects, so only they need the team list.
  const teams = useLoad(() => (isAdmin ? teamsService.list() : Promise.resolve([])), [isAdmin])

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const validate = () => {
    const next = { title: '', deadline: '' }

    // Mirrors the API's zod schema so users see the error inline.
    if (!formData.title.trim()) {
      next.title = 'Project title is required'
    } else if (formData.title.trim().length < 3) {
      next.title = 'Title must be at least 3 characters'
    }

    if (formData.startDate && formData.deadline && formData.deadline < formData.startDate) {
      next.deadline = 'Deadline cannot be before the start date'
    }

    setErrors(next)
    return !next.title && !next.deadline
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    const problems = linkErrors(linkRows)
    setLinkProblems(problems)
    if (Object.keys(problems).length > 0) return

    setLoading(true)
    let created
    try {
      const referenceLinks = rowsToLinks(linkRows)
      created = await projectsService.create({
        title: formData.title,
        description: formData.description,
        requirements: formData.requirements || undefined,
        startDate: formData.startDate || undefined,
        deadline: formData.deadline || undefined,
        ...(formData.teamId ? { teamId: formData.teamId } : {}),
        ...(referenceLinks.length > 0 ? { referenceLinks } : {}),
      })
    } catch (error) {
      notify('error', errorMessage(error, 'Failed to create project'))
      setLoading(false)
      return
    }

    // The project exists now, so its files can be added to it. A failed file never undoes the project.
    const failed: string[] = []
    for (const file of pendingFiles) {
      try {
        const result = await projectResourcesService.uploadFile(created._id, file)
        result.rejected.forEach((r) => failed.push(`${r.name}: ${r.error}`))
      } catch (error) {
        failed.push(`${file.name}: ${errorMessage(error, 'upload failed')}`)
      }
    }

    if (failed.length > 0) {
      notify('warning', `Project created, but ${failed.length === 1 ? 'a file was' : failed.length + ' files were'} not added (${failed[0]}). You can add files from the project.`)
    } else {
      notify('success', 'Project created')
    }
    setTimeout(() => router.push(`/dashboard/projects/${created._id}`), failed.length > 0 ? 2500 : 900)
  }

  // A convenience for people who type the URL: the API refuses non-admins
  // regardless (403), so this is not the security boundary.
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-caution-subtle text-caution-strong">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">Admin only</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Only an admin can create a project. Ask yours to set one up and staff your team onto it.
        </p>
        <Link
          href="/dashboard/projects"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-interactive hover:text-interactive-hover"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to projects
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full">
      <Link
        href="/dashboard/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to projects
      </Link>

      <header className="animate-rise mb-6 flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent text-on-brand">
          <FolderPlus className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Create new project</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Give it a name and a timeline. Staff a team now or later.
          </p>
          <Link
            href="/dashboard/projects/templates"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-interactive hover:text-interactive-hover"
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
            Or start from a template
          </Link>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="animate-rise grid grid-cols-1 gap-x-8 gap-y-5 rounded-card border border-hairline bg-surface p-6 shadow-card lg:grid-cols-2"
        style={{ animationDelay: '0.05s' }}
      >
        <div className="space-y-5">
        <Input
          label="Project title"
          name="title"
          placeholder="Website redesign"
          value={formData.title}
          onChange={handleChange}
          error={errors.title}
        />

        <Textarea
          label="Description"
          name="description"
          placeholder="What is this project about?"
          value={formData.description}
          onChange={handleChange}
          rows={3}
        />

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Input
            label="Start date"
            name="startDate"
            type="date"
            value={formData.startDate}
            onChange={handleChange}
          />
          <Input
            label="Deadline"
            name="deadline"
            type="date"
            value={formData.deadline}
            onChange={handleChange}
            error={errors.deadline}
          />
        </div>
        </div>

        <div className="space-y-5 rounded-xl border border-hairline bg-surface-sunken/50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            <ClipboardList className="h-3.5 w-3.5" />
            Requirements &amp; staffing
          </p>

          <Textarea
            label="Requirements"
            name="requirements"
            placeholder="What does this project need to deliver?"
            value={formData.requirements}
            onChange={handleChange}
            rows={3}
          />

          <div>
            <Select label="Team" name="teamId" value={formData.teamId} onChange={handleChange}>
              <option value="">Assign later</option>
              {teams.data?.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} — led by {t.teamLeader?.name}
                </option>
              ))}
            </Select>
            {teams.data?.length === 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                No teams yet — create one in Admin → Teams.
              </p>
            )}
            {teams.error && (
              <p className="mt-1 text-xs text-critical-strong">
                Could not load teams — you can assign one later in project settings.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-5 rounded-xl border border-hairline bg-surface-sunken/50 p-4 lg:col-span-2">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              <Link2 className="h-3.5 w-3.5" />
              Reference material
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Everything the team should look at: the expected website, a Figma design, a brief. The team leader and developers on this project can open all of it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-x-8 gap-y-5 lg:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-soft">
                <Link2 className="h-4 w-4 text-ink-faint" />
                Reference links
              </p>
              <ReferenceLinksEditor rows={linkRows} onChange={setLinkRows} errors={linkProblems} />
            </div>
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-ink-soft">
                <Paperclip className="h-4 w-4 text-ink-faint" />
                Files
              </p>
              <PendingFilesPicker files={pendingFiles} onChange={setPendingFiles} />
            </div>
          </div>
        </div>

        <div className="flex gap-3 border-t border-hairline pt-5 lg:col-span-2">
          <Button type="submit" isLoading={loading} className="flex-1">
            Create project
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            className="flex-1"
          >
            Cancel
          </Button>
        </div>
      </form>

      {toastNode}
    </div>
  )
}
