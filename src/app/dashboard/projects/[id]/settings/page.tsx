'use client'

import { AlertTriangle } from 'lucide-react'
import { useProject } from '@/features/projects/ProjectContext'
import { ProjectDetailsForm } from '@/features/projects/ProjectDetailsForm'
import { StaffingSection } from '@/features/projects/StaffingSection'
import { DangerZone } from '@/features/projects/DangerZone'
import { SaveAsTemplate } from '@/features/projects/SaveAsTemplate'
import { MembersSection } from '@/features/projects/MembersSection'

/** What each section shows is decided by the server's `can` flags, not by role names. */
export default function ProjectSettingsPage() {
  const { project, can, applyProject } = useProject()

  return (
    <div className="grid grid-cols-1 items-start gap-x-6 xl:grid-cols-2">
      {can.canAssignTeam && (
        <StaffingSection
          project={project}
          onAssigned={(updated) => applyProject({ team: updated.team, members: updated.members })}
        />
      )}

      {can.canEdit ? (
        <ProjectDetailsForm
          project={project}
          onSaved={(updated) =>
            applyProject({
              title: updated.title,
              description: updated.description,
              requirements: updated.requirements,
              status: updated.status,
              deadline: updated.deadline,
            })
          }
        />
      ) : (
        <div className="mt-6 rounded-card border border-hairline bg-surface p-6 text-center shadow-card">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-caution-subtle text-caution-strong">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <h2 className="mt-3 font-medium text-ink">Owner or team lead only</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Only the admin who owns this project or its team leader can change these settings.
          </p>
        </div>
      )}

      <div className="mt-6">
        <MembersSection />
      </div>

      {/* Owner only (the server checks it too): the owner is the admin who created the project. */}
      {can.canDelete && <SaveAsTemplate project={project} />}

      {can.canDelete && <DangerZone project={project} />}
    </div>
  )
}
