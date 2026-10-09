'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LayoutTemplate } from 'lucide-react'
import { templatesService } from '@/services/templates.service'
import { errorMessage } from '@/services/client'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { TEMPLATE_LIMITS } from '@/types'
import type { Project } from '@/types'

/**
 * Owner only: keep this project's structure as a reusable template. Only titles,
 * descriptions, priorities and (where clear) due-date offsets are copied; never
 * statuses, assignees, comments, files, activity or dependencies.
 */
export function SaveAsTemplate({ project }: { project: Project }) {
  const [name, setName] = useState(`${project.title} template`.slice(0, TEMPLATE_LIMITS.name.max))
  const [saving, setSaving] = useState(false)
  const [savedName, setSavedName] = useState<string | null>(null)
  const { notify, toastNode } = useToast()

  const save = async () => {
    if (saving || savedName) return
    if (name.trim().length < TEMPLATE_LIMITS.name.min) {
      notify('error', `Name must be at least ${TEMPLATE_LIMITS.name.min} characters`)
      return
    }
    setSaving(true)
    try {
      const { template, truncated } = await templatesService.createFromProject(project._id, name.trim())
      setSavedName(template.name)
      notify('success', truncated ? `Saved “${template.name}” (first ${TEMPLATE_LIMITS.tasks} tasks only)` : `Saved “${template.name}”`)
    } catch (e) {
      notify('error', errorMessage(e, 'Could not save the template'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        <LayoutTemplate className="h-4 w-4 text-ink-muted" />
        Save as template
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Keep this project&apos;s tasks as a template for new projects. Only titles, descriptions, priorities and due-date offsets are copied: no statuses, assignees, comments, files or dependencies.
      </p>
      <div className="mt-4 space-y-3">
        <Input label="Template name" value={name} onChange={(e) => setName(e.target.value)} maxLength={TEMPLATE_LIMITS.name.max} disabled={Boolean(savedName)} />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" isLoading={saving} disabled={Boolean(savedName)} onClick={() => void save()}>
            {savedName ? 'Saved' : 'Save as template'}
          </Button>
          {savedName && (
            <Link href="/dashboard/projects/templates" className="text-sm font-medium text-interactive hover:text-interactive-hover">
              View templates
            </Link>
          )}
        </div>
      </div>
      {toastNode}
    </section>
  )
}
