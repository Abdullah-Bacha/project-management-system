'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertTriangle, Save, Trash2, UserCog } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { teamsService } from '@/services/admin.service'
import { useAuth } from '@/hooks/useAuth'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast } from '@/components/ui/Toast'

const statuses = ['active', 'archived', 'completed'] as const

function toDateInput(value?: string | Date | null) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

export default function ProjectSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const { user } = useAuth()

  const [project, setProject] = useState<any>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    requirements: '',
    status: 'active' as (typeof statuses)[number],
    deadline: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)

  useEffect(() => {
    if (!projectId) return

    projectsService
      .getOne(projectId)
      .then((p) => {
        setProject(p)
        setForm({
          title: p.title ?? '',
          description: p.description ?? '',
          requirements: p.requirements ?? '',
          status: p.status ?? 'active',
          deadline: toDateInput(p.deadline),
        })
      })
      .catch(() => setError('Could not load this project.'))
      .finally(() => setLoading(false))
  }, [projectId])

  const ownerId =
    typeof project?.owner === 'string' ? project.owner : project?.owner?._id
  const isOwner = Boolean(ownerId && user && ownerId === user._id)
  const isAdmin = user?.role === 'admin'
  const isTeamLeaderHere = Boolean(
    user && project?.team?.teamLeader?._id === user._id
  )
  // Owner (admin who created it) or the project's team leader can edit its
  // content. Staffing and deletion stay admin-only, further down.
  const canEdit = isOwner || isTeamLeaderHere

  const handleSave = async () => {
    if (form.title.trim().length < 3) {
      setError('Title must be at least 3 characters')
      return
    }

    setError('')
    setSaving(true)
    try {
      const updated = await projectsService.update(projectId, {
        title: form.title.trim(),
        description: form.description,
        requirements: form.requirements,
        status: form.status,
        ...(form.deadline && { deadline: form.deadline }),
      })
      setProject(updated)
      setToast({ type: 'success', message: 'Project updated' })
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.data?.error || 'Failed to save',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await projectsService.delete(projectId)
      router.push('/dashboard/projects')
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.data?.error || 'Failed to delete',
      })
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="skeleton h-8 w-64 rounded-lg" />
        <div className="skeleton h-64 rounded-card" />
      </div>
    )
  }

  if (!project) {
    return <p className="text-sm text-critical">{error || 'Project not found.'}</p>
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="animate-rise">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {project.title}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Project settings</p>
      </header>

      <ProjectTabs projectId={projectId} />

      {isAdmin && (
        <StaffingSection
          project={project}
          onAssigned={(updated) => setProject(updated)}
        />
      )}

      {!canEdit ? (
        <div className="mt-6 rounded-card border border-hairline bg-surface p-6 text-center shadow-card">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-caution/12 text-caution">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h2 className="mt-3 font-medium text-ink">Owner or team lead only</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Only the admin who owns this project or its team leader can
            change these settings.
          </p>
        </div>
      ) : (
        <section className="mt-6 space-y-5 rounded-card border border-hairline bg-surface p-6 shadow-card">
          <Input
            label="Project title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            error={error}
          />

          <div>
            <label
              htmlFor="project-description"
              className="mb-1.5 block text-sm font-medium text-ink-soft"
            >
              Description
            </label>
            <textarea
              id="project-description"
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              className="w-full resize-y rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
            />
          </div>

          <div>
            <label
              htmlFor="project-requirements"
              className="mb-1.5 block text-sm font-medium text-ink-soft"
            >
              Requirements
            </label>
            <textarea
              id="project-requirements"
              rows={3}
              value={form.requirements}
              onChange={(e) =>
                setForm({ ...form, requirements: e.target.value })
              }
              className="w-full resize-y rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-ink placeholder:text-ink-faint transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="project-status"
                className="mb-1.5 block text-sm font-medium text-ink-soft"
              >
                Status
              </label>
              <select
                id="project-status"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as any })
                }
                className="h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm capitalize text-ink transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
              >
                {statuses.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Deadline"
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
            />
          </div>

          <div className="border-t border-hairline pt-5">
            <Button
              onClick={handleSave}
              isLoading={saving}
              icon={<Save className="h-4 w-4" />}
            >
              Save changes
            </Button>
          </div>
        </section>
      )}

      {isOwner && (
        <section className="mt-6 rounded-card border border-critical/30 bg-critical/4 p-6">
          <h2 className="flex items-center gap-2 font-semibold text-ink">
            <AlertTriangle className="h-4 w-4 text-critical" />
            Danger zone
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Deleting this project also deletes its tasks, comments and
            notifications. This cannot be undone.
          </p>

          <div className="mt-4 space-y-3">
            <Input
              label={`Type "${project.title}" to confirm`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={project.title}
            />
            <Button
              variant="danger"
              isLoading={deleting}
              disabled={confirmText !== project.title}
              onClick={handleDelete}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Delete this project
            </Button>
          </div>
        </section>
      )}

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

function StaffingSection({
  project,
  onAssigned,
}: {
  project: any
  onAssigned: (project: any) => void
}) {
  const [teams, setTeams] = useState<any[]>([])
  const [teamId, setTeamId] = useState(project.team?._id ?? '')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)

  useEffect(() => {
    teamsService
      .list()
      .then(setTeams)
      .catch(() => {})
  }, [])

  const dirty = teamId !== (project.team?._id ?? '')

  const handleAssign = async () => {
    setSaving(true)
    try {
      const updated = await projectsService.assign(project._id, {
        teamId: teamId || null,
      })
      onAssigned(updated)
      setToast({ type: 'success', message: 'Staffing updated' })
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.data?.error || 'Failed to update staffing',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="animate-rise mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <UserCog className="h-4 w-4 text-brand-600" />
        Staffing
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Assign which team runs this project. The team&apos;s leader manages it
        day to day.
      </p>

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-ink-soft">Team</label>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="h-11 w-full max-w-sm rounded-xl border border-hairline bg-surface px-3 text-sm text-ink transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
        >
          <option value="">Unassigned</option>
          {teams.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name} — led by {t.teamLeader?.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 border-t border-hairline pt-4">
        <Button onClick={handleAssign} isLoading={saving} disabled={!dirty}>
          Save staffing
        </Button>
      </div>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </section>
  )
}
