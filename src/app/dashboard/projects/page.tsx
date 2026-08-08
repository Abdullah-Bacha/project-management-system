'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, FolderKanban } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { useAuth } from '@/hooks/useAuth'
import { ProjectCard } from '@/components/projects/ProjectCard'
import { Project } from '@/types'

export default function ProjectsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProjects()
  }, [])

  const loadProjects = async () => {
    try {
      setLoading(true)
      const data = await projectsService.getAll(0, 50)
      setProjects(data.projects || [])
    } catch (error) {
      console.error('Failed to load projects:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="animate-rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Projects
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {loading
              ? 'Loading…'
              : `${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`}
          </p>
        </div>

        {isAdmin && (
          <Link
            href="/dashboard/projects/new"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-600 px-4 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-brand-700 hover:shadow-lifted active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Link>
        )}
      </header>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
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
              ? 'Projects hold your tasks, team and timeline. Create one to begin.'
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
            <ProjectCard key={project._id} project={project} delay={i * 0.05} />
          ))}
        </div>
      )}
    </div>
  )
}
