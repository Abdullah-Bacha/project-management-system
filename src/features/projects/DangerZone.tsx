'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { projectsService } from '@/services/projects.service'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { Project } from '@/types'
import { errorMessage } from '@/services/client'

/** Owner only: delete the project after typing its title to confirm. */
export function DangerZone({ project }: { project: Project }) {
  const router = useRouter()
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const { notify, toastNode } = useToast()

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await projectsService.delete(project._id)
      router.push('/dashboard/projects')
    } catch (e) {
      notify('error', errorMessage(e, 'Failed to delete'))
      setDeleting(false)
    }
  }

  return (
    <section className="mt-6 rounded-card border border-critical/30 bg-critical-subtle p-6">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <AlertTriangle className="h-4 w-4 text-critical" />
        Danger zone
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Deleting this project also deletes its tasks, comments, notifications and reports. This
        cannot be undone.
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

      {toastNode}
    </section>
  )
}
