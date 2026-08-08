'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, FolderPlus, ClipboardList, ShieldAlert } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { teamsService } from '@/services/admin.service'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast } from '@/components/ui/Toast'

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
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)
  const [errors, setErrors] = useState({ title: '', deadline: '' })
  const [teams, setTeams] = useState<any[]>([])

  useEffect(() => {
    if (!isAdmin) return
    teamsService
      .list()
      .then(setTeams)
      .catch(() => {})
  }, [isAdmin])

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

    if (
      formData.startDate &&
      formData.deadline &&
      formData.deadline < formData.startDate
    ) {
      next.deadline = 'Deadline cannot be before the start date'
    }

    setErrors(next)
    return !next.title && !next.deadline
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    try {
      setLoading(true)
      await projectsService.create({
        title: formData.title,
        description: formData.description,
        requirements: formData.requirements || undefined,
        startDate: formData.startDate || undefined,
        deadline: formData.deadline || undefined,
        ...(formData.teamId ? { teamId: formData.teamId } : {}),
      })
      setToast({ type: 'success', message: 'Project created' })
      setTimeout(() => router.push('/dashboard/projects'), 900)
    } catch (error: any) {
      setToast({
        type: 'error',
        message: error.response?.data?.error || 'Failed to create project',
      })
    } finally {
      setLoading(false)
    }
  }

  // Project creation is admin-only — this page only exists as a route a
  // non-admin could type directly, since the "New Project" links are already
  // hidden from them. Defense in depth, not the primary gate (the API 403s
  // regardless). By the time this mounts the dashboard layout has already
  // hydrated `user` from localStorage, so this doesn't flash for real admins.
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-caution/12 text-caution">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">Admin only</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Only an admin can create a project. Ask yours to set one up and
          staff your team onto it.
        </p>
        <Link
          href="/dashboard/projects"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to projects
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/dashboard/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to projects
      </Link>

      <header className="animate-rise mb-6 flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-accent text-white">
          <FolderPlus className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Create new project
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Give it a name and a timeline. Staff a team now or later.
          </p>
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="animate-rise space-y-5 rounded-card border border-hairline bg-surface p-6 shadow-card"
        style={{ animationDelay: '0.05s' }}
      >
        <Input
          label="Project title"
          name="title"
          placeholder="Website redesign"
          value={formData.title}
          onChange={handleChange}
          error={errors.title}
        />

        <div>
          <label
            htmlFor="description"
            className="mb-1.5 block text-sm font-medium text-ink-soft"
          >
            Description
          </label>
          <textarea
            id="description"
            name="description"
            placeholder="What is this project about?"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="w-full resize-y rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
          />
        </div>

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

        <div className="space-y-5 rounded-xl border border-hairline bg-surface-sunken/50 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            <ClipboardList className="h-3.5 w-3.5" />
            Requirements &amp; staffing
          </p>

          <div>
            <label
              htmlFor="requirements"
              className="mb-1.5 block text-sm font-medium text-ink-soft"
            >
              Requirements
            </label>
            <textarea
              id="requirements"
              name="requirements"
              placeholder="What does this project need to deliver?"
              value={formData.requirements}
              onChange={handleChange}
              rows={3}
              className="w-full resize-y rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink-soft">
              Team
            </label>
            <select
              name="teamId"
              value={formData.teamId}
              onChange={handleChange}
              className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
            >
              <option value="">Assign later</option>
              {teams.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name} — led by {t.teamLeader?.name}
                </option>
              ))}
            </select>
            {teams.length === 0 && (
              <p className="mt-1 text-xs text-ink-faint">
                No teams yet — create one in Admin → Teams.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 border-t border-hairline pt-5">
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

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
