'use client'

import { createContext, useContext } from 'react'
import type { Project, ProjectCapabilities } from '@/types'

interface ProjectContextValue {
  project: Project
  /** What the server says the current user may do here. */
  can: ProjectCapabilities
  /**
   * Show a change immediately (e.g. from a mutation's response) without
   * another request; the next realtime signal reconciles it with the server.
   */
  applyProject: (changes: Partial<Project>) => void
}

const ProjectContext = createContext<ProjectContextValue | null>(null)

export const ProjectProvider = ProjectContext.Provider

/**
 * The project the current /dashboard/projects/[id]/* page belongs to. The
 * project layout loads it once and keeps it live, so the Overview, Board,
 * Analytics, Members and Settings tabs share it instead of each refetching.
 */
export function useProject() {
  const value = useContext(ProjectContext)
  if (!value) throw new Error('useProject must be used inside the project layout')
  return value
}

export const NO_CAPABILITIES: ProjectCapabilities = {
  canEdit: false,
  canManageMembers: false,
  canDelete: false,
  canAssignTeam: false,
}
