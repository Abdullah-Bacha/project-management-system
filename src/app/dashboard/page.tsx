'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ListChecks,
  CheckCircle2,
  Target,
  FolderKanban,
  Plus,
  ArrowRight,
  Bell,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { projectsService } from '@/services/projects.service'
import { StatsCard } from '@/components/dashboard/StatsCard'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { Project } from '@/types'

export default function DashboardPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [totalTasks, setTotalTasks] = useState(0)
  const [completedTasks, setCompletedTasks] = useState(0)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const data = await projectsService.getAll(0, 6)
      const list: Project[] = data.projects || []
      setProjects(list)

      // Fetch every project's analytics at once rather than serially.
      const analytics = await Promise.all(
        list.map((p) =>
          projectsService.getAnalytics(p._id).catch(() => null)
        )
      )
      setTotalTasks(
        analytics.reduce((sum, a) => sum + (a?.totalTasks ?? 0), 0)
      )
      setCompletedTasks(
        analytics.reduce((sum, a) => sum + (a?.completedTasks ?? 0), 0)
      )
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const completionRate =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  return (
    <div className="mx-auto max-w-7xl">
      <header className="animate-rise">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Welcome back, {user?.name?.split(' ')[0]}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Here&apos;s what&apos;s happening across your projects.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          label="Total Tasks"
          value={totalTasks}
          icon={<ListChecks className="h-5 w-5" />}
          tone="brand"
          delay={0.05}
        />
        <StatsCard
          label="Completed"
          value={completedTasks}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="positive"
          delay={0.1}
        />
        <StatsCard
          label="Completion Rate"
          value={`${completionRate}%`}
          icon={<Target className="h-5 w-5" />}
          tone="caution"
          delay={0.15}
        />
        <StatsCard
          label="Projects"
          value={projects.length}
          icon={<FolderKanban className="h-5 w-5" />}
          tone="brand"
          delay={0.2}
        />
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">
            Your Projects
          </h2>
          {isAdmin && (
            <Link
              href="/dashboard/projects/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-brand-700 hover:shadow-lifted active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              New Project
            </Link>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-52 rounded-card" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="animate-rise rounded-card border border-dashed border-hairline bg-surface p-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <FolderKanban className="h-6 w-6" />
            </span>
            <h3 className="mt-4 font-medium text-ink">No projects yet</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
              {isAdmin
                ? 'Create your first project to start organising work into tasks.'
                : "You'll see projects here once an admin staffs your team onto one."}
            </p>
            {isAdmin && (
              <Link
                href="/dashboard/projects/new"
                className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white transition-all hover:bg-brand-700"
              >
                <Plus className="h-4 w-4" />
                Create project
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project, i) => (
              <ProjectCard
                key={project._id}
                project={project}
                delay={i * 0.06}
              />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
        <QuickLink
          href="/dashboard/projects"
          icon={<FolderKanban className="h-5 w-5" />}
          title="View all projects"
          description="Browse and manage everything you own"
        />
        <QuickLink
          href="/dashboard/notifications"
          icon={<Bell className="h-5 w-5" />}
          title="Notifications"
          description="Catch up on updates and mentions"
        />
      </section>
    </div>
  )
}

function QuickLink({
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
