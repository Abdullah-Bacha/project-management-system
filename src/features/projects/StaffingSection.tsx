'use client'

import { useState } from 'react'
import { UserCog } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { teamsService } from '@/services/admin.service'
import { useLoad } from '@/hooks/useLoad'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import type { Project } from '@/types'
import { errorMessage } from '@/services/client'

/** Admin only: choose which team is staffed on the project. */
export function StaffingSection({
  project,
  onAssigned,
}: {
  project: Project
  onAssigned: (updated: Project) => void
}) {
  const teams = useLoad(() => teamsService.list(), [])
  const [teamId, setTeamId] = useState(project.team?._id ?? '')
  const [saving, setSaving] = useState(false)
  const { notify, toastNode } = useToast()

  const dirty = teamId !== (project.team?._id ?? '')

  const handleAssign = async () => {
    setSaving(true)
    try {
      const updated = await projectsService.assign(project._id, { teamId: teamId || null })
      onAssigned(updated)
      notify('success', 'Staffing updated')
    } catch (e) {
      notify('error', errorMessage(e, 'Failed to update staffing'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="animate-rise mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <UserCog className="h-4 w-4 text-interactive" />
        Staffing
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Assign which team runs this project. The team&apos;s leader manages it day to day.
      </p>

      <div className="mt-4 max-w-sm">
        <Select label="Team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Unassigned</option>
          {teams.data?.map((t) => (
            <option key={t._id} value={t._id}>
              {t.name} — led by {t.teamLeader?.name}
            </option>
          ))}
        </Select>
        {teams.error && (
          <p className="mt-1.5 text-sm text-critical-strong">Could not load teams.</p>
        )}
      </div>

      <div className="mt-4 border-t border-hairline pt-4">
        <Button onClick={handleAssign} isLoading={saving} disabled={!dirty}>
          Save staffing
        </Button>
      </div>

      {toastNode}
    </section>
  )
}
