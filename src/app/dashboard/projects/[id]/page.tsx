'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ListChecks,
  CheckCircle2,
  Target,
  AlertTriangle,
  KanbanSquare,
  BarChart3,
  ArrowRight,
  Users,
  CalendarDays,
  Crown,
  UsersRound,
  ClipboardList,
  Send,
  Loader2,
} from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { reportsService } from '@/services/reports.service'
import { useAuth } from '@/hooks/useAuth'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { ProjectTabs } from '@/components/projects/ProjectTabs'
import { Button } from '@/components/ui/Button'
import { Toast } from '@/components/ui/Toast'

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = params.id as string
  const { user } = useAuth()

  const [project, setProject] = useState<any>(null)
  const [analytics, setAnalytics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId) return

    Promise.all([
      projectsService.getOne(projectId),
      projectsService.getAnalytics(projectId),
    ])
      .then(([proj, stats]) => {
        setProject(proj)
        setAnalytics(stats)
      })
      .catch((error) => console.error('Failed to load project:', error))
      .finally(() => setLoading(false))
  }, [projectId])

  if (loading || !project || !analytics) {
    return (
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="skeleton h-8 w-64 rounded-lg" />
        <div className="skeleton h-10 w-full max-w-md rounded-lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-28 rounded-card" />
          ))}
        </div>
      </div>
    )
  }

  const ownerId =
    typeof project.owner === 'string' ? project.owner : project.owner?._id
  const isEditor = Boolean(
    user &&
      (ownerId === user._id || project.team?.teamLeader?._id === user._id)
  )

  return (
    <div className="mx-auto max-w-7xl">
      <header className="animate-rise">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          {project.title}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {project.description || 'No description yet.'}
        </p>
      </header>

      <ProjectTabs projectId={projectId} />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Total Tasks"
          value={analytics.totalTasks}
          icon={<ListChecks className="h-5 w-5" />}
          tone="brand"
          delay={0.05}
        />
        <StatsCard
          label="Completed"
          value={analytics.completedTasks}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="positive"
          delay={0.1}
        />
        <StatsCard
          label="Completion Rate"
          value={`${analytics.completionRate}%`}
          icon={<Target className="h-5 w-5" />}
          tone="caution"
          delay={0.15}
        />
        <StatsCard
          label="Overdue"
          value={analytics.overdueTasks}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="critical"
          delay={0.2}
        />
      </div>

      <section className="mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
        <h2 className="font-semibold text-ink">Project status</h2>

        <div className="mt-4">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-ink-muted">Overall progress</span>
            <span className="text-sm font-semibold text-ink tabular-nums">
              {project.progress}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent transition-all duration-700 ease-out"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-4 border-t border-hairline pt-5 sm:grid-cols-3">
          <Detail
            icon={<Target className="h-4 w-4" />}
            label="Status"
            value={project.status}
          />
          <Detail
            icon={<Users className="h-4 w-4" />}
            label="Members"
            value={String(project.members?.length ?? 0)}
          />
          <Detail
            icon={<CalendarDays className="h-4 w-4" />}
            label="Created"
            value={new Date(project.createdAt).toLocaleDateString()}
          />
        </dl>
      </section>

      {(project.team || project.requirements) && (
        <section className="mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
          <h2 className="font-semibold text-ink">Staffing &amp; requirements</h2>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {project.team && (
              <>
                <Detail
                  icon={<Crown className="h-4 w-4" />}
                  label="Team leader"
                  value={project.team.teamLeader?.name ?? 'Unassigned'}
                />
                <Detail
                  icon={<UsersRound className="h-4 w-4" />}
                  label="Team"
                  value={project.team.name}
                />
              </>
            )}
          </div>

          {project.requirements && (
            <div className="mt-5 border-t border-hairline pt-5">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                <ClipboardList className="h-3.5 w-3.5" />
                Requirements
              </p>
              <p className="whitespace-pre-line text-sm text-ink-soft">
                {project.requirements}
              </p>
            </div>
          )}
        </section>
      )}

      {project.team && (
        <ReportSection
          projectId={projectId}
          analytics={analytics}
          isEditor={isEditor}
        />
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <NavCard
          href={`/dashboard/projects/${projectId}/kanban`}
          icon={<KanbanSquare className="h-5 w-5" />}
          title="Kanban Board"
          description="Move tasks through the pipeline"
        />
        <NavCard
          href={`/dashboard/projects/${projectId}/analytics`}
          icon={<BarChart3 className="h-5 w-5" />}
          title="Analytics"
          description="Metrics, effort and completion trends"
        />
      </section>
    </div>
  )
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
        {icon}
      </span>
      <div>
        <dt className="text-xs text-ink-muted">{label}</dt>
        <dd className="text-sm font-medium capitalize text-ink">{value}</dd>
      </div>
    </div>
  )
}

function NavCard({
  href,
  icon,
  title,
  description,
}: {
  href: string
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-card border border-hairline bg-surface p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lifted"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-transform duration-300 group-hover:scale-110">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-sm text-ink-muted">{description}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-1" />
    </Link>
  )
}

function ReportSection({
  projectId,
  analytics,
  isEditor,
}: {
  projectId: string
  analytics: any
  isEditor: boolean
}) {
  const [reports, setReports] = useState<any[]>([])
  const [loadingReports, setLoadingReports] = useState(true)
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)

  const loadReports = () => {
    reportsService
      .listForProject(projectId)
      .then(setReports)
      .catch(() => setReports([]))
      .finally(() => setLoadingReports(false))
  }

  useEffect(() => {
    loadReports()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const handleSend = async () => {
    setSending(true)
    try {
      await reportsService.submit(projectId, note.trim() || undefined)
      setToast({ type: 'success', message: 'Report sent to admin' })
      setNote('')
      loadReports()
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.data?.error || 'Failed to send report',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
      <h2 className="font-semibold text-ink">Progress reports</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {isEditor
          ? "Send admin a snapshot of today's progress on this project."
          : "Your team leader's progress updates to admin."}
      </p>

      {isEditor && (
        <div className="mt-4 rounded-xl border border-hairline bg-surface-sunken/50 p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-ink-soft">
              <span className="font-semibold text-ink tabular-nums">
                {analytics.completedTasks}
              </span>{' '}
              of{' '}
              <span className="font-semibold text-ink tabular-nums">
                {analytics.totalTasks}
              </span>{' '}
              tasks complete
            </span>
            <span className="text-ink-soft">
              <span className="font-semibold text-ink tabular-nums">
                {analytics.completionRate}%
              </span>{' '}
              overall
            </span>
            <span className="text-ink-soft">
              <span className="font-semibold text-ink tabular-nums">
                {analytics.totalTasks - analytics.completedTasks}
              </span>{' '}
              remaining
            </span>
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note for admin (optional)…"
            rows={2}
            className="mt-3 w-full resize-y rounded-xl border border-hairline bg-surface px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint transition-all focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/12"
          />

          <div className="mt-3">
            <Button
              onClick={handleSend}
              isLoading={sending}
              icon={<Send className="h-4 w-4" />}
            >
              Send report to admin
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-hairline pt-4">
        {loadingReports ? (
          <div className="flex items-center gap-2 py-3 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading reports…
          </div>
        ) : reports.length === 0 ? (
          <p className="py-3 text-sm text-ink-faint">No reports sent yet.</p>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r._id} className="rounded-xl bg-surface-sunken px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">
                    {r.submittedBy?.name}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {new Date(r.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {r.completedToday?.length ?? 0} task(s) completed that day —{' '}
                  {r.completionRate}% overall ({r.completedTasks}/{r.totalTasks})
                </p>
                {r.note && (
                  <p className="mt-1.5 whitespace-pre-line text-sm text-ink-muted">
                    “{r.note}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
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
