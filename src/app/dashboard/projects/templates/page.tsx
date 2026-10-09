'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Eye, FolderPlus, LayoutTemplate, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { templatesService } from '@/services/templates.service'
import { errorMessage } from '@/services/client'
import { useAuth } from '@/hooks/useAuth'
import { useLoad } from '@/hooks/useLoad'
import { useToast } from '@/hooks/useToast'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState } from '@/components/ui/PageState'
import { TemplateForm } from '@/features/templates/TemplateForm'
import { TemplatePreview } from '@/features/templates/TemplatePreview'
import { UseTemplateModal } from '@/features/templates/UseTemplateModal'
import type { ProjectTemplate } from '@/types'

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; template: ProjectTemplate }
  | { kind: 'preview'; template: ProjectTemplate }
  | { kind: 'use'; template: ProjectTemplate }
  | { kind: 'delete'; template: ProjectTemplate }

/** The admin's template library: create, edit, preview, delete, and start a project from one. */
export default function TemplatesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const { data, loading, error, errorStatus, reload } = useLoad(() => (isAdmin ? templatesService.list() : Promise.resolve([])), [isAdmin])
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { notify, toastNode } = useToast()

  // A convenience for people who type the URL: the API refuses non-admins (403) regardless.
  if (user && !isAdmin) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-caution-subtle text-caution-strong">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">Admin only</h1>
        <p className="mt-1 text-sm text-ink-muted">Project templates are managed by admins, who create projects.</p>
        <Link href="/dashboard/projects" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-interactive hover:text-interactive-hover">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to projects
        </Link>
      </div>
    )
  }

  const templates = data ?? []

  const confirmDelete = async (t: ProjectTemplate) => {
    if (deleting) return
    setDeleting(true)
    try {
      await templatesService.delete(t._id)
      notify('success', `Deleted “${t.name}”. Projects made from it are unchanged.`)
      setDialog(null)
      await reload()
    } catch (e) {
      notify('error', errorMessage(e, 'Could not delete the template'))
    } finally {
      setDeleting(false)
    }
  }

  const newButton = (
    <Button icon={<Plus className="h-4 w-4" />} onClick={() => setDialog({ kind: 'create' })}>
      New template
    </Button>
  )

  return (
    <div>
      <Link href="/dashboard/projects" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to projects
      </Link>

      <header className="animate-rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Project templates</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {loading ? 'Loading…' : data ? `${templates.length} ${templates.length === 1 ? 'template' : 'templates'}` : 'Could not load templates'}
          </p>
        </div>
        {newButton}
      </header>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-48 rounded-card" />
          ))}
        </div>
      ) : !data ? (
        <ErrorState message={error} status={errorStatus} onRetry={reload} />
      ) : templates.length === 0 ? (
        <EmptyState icon={<LayoutTemplate className="h-6 w-6" />} title="No templates yet" action={newButton}>
          Save a reusable set of tasks once, then start new projects from it. You can also save an existing project from its settings.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {templates.map((t) => (
            <li key={t._id} className="animate-rise flex min-w-0 flex-col rounded-card border border-hairline bg-surface p-5 shadow-card">
              <div className="min-w-0 flex-1">
                <h2 className="break-words font-semibold text-ink">{t.name}</h2>
                {t.category && <span className="mt-1 inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700">{t.category}</span>}
                {t.description && <p className="mt-2 line-clamp-3 break-words text-sm text-ink-muted">{t.description}</p>}
                <p className="mt-3 text-xs text-ink-faint">
                  {t.tasks.length} {t.tasks.length === 1 ? 'task' : 'tasks'} · updated {new Date(t.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
                <Button size="sm" icon={<FolderPlus className="h-4 w-4" />} onClick={() => setDialog({ kind: 'use', template: t })}>
                  Use
                </Button>
                <Button size="sm" variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={() => setDialog({ kind: 'preview', template: t })} aria-label={`Preview ${t.name}`}>
                  Preview
                </Button>
                <Button size="sm" variant="ghost" icon={<Pencil className="h-4 w-4" />} onClick={() => setDialog({ kind: 'edit', template: t })} aria-label={`Edit ${t.name}`}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDialog({ kind: 'delete', template: t })} aria-label={`Delete ${t.name}`}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(dialog?.kind === 'create' || dialog?.kind === 'edit') && (
        <TemplateForm
          template={dialog.kind === 'edit' ? dialog.template : undefined}
          onClose={() => setDialog(null)}
          onSaved={(t, mode) => {
            setDialog(null)
            notify('success', mode === 'created' ? `Saved “${t.name}”` : `Updated “${t.name}”. New projects will use the changes; existing ones are unchanged.`)
            void reload()
          }}
        />
      )}

      {dialog?.kind === 'preview' && (
        <Modal title="Template preview" placement="right" onClose={() => setDialog(null)}>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <TemplatePreview {...dialog.template} />
          </div>
          <footer className="flex shrink-0 gap-3 border-t border-hairline p-4">
            <Button className="flex-1" icon={<FolderPlus className="h-4 w-4" />} onClick={() => setDialog({ kind: 'use', template: dialog.template })}>
              Use this template
            </Button>
          </footer>
        </Modal>
      )}

      {dialog?.kind === 'use' && <UseTemplateModal template={dialog.template} onClose={() => setDialog(null)} />}

      {dialog?.kind === 'delete' && (
        <Modal title="Delete template" onClose={() => (deleting ? undefined : setDialog(null))}>
          <div className="space-y-4 p-5">
            <p className="break-words text-sm text-ink-soft">
              Delete <strong className="text-ink">{dialog.template.name}</strong>? Projects and tasks already created from it are not affected. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setDialog(null)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="danger" isLoading={deleting} onClick={() => void confirmDelete(dialog.template)} icon={<Trash2 className="h-4 w-4" />} className="flex-1">
                Delete template
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {toastNode}
    </div>
  )
}
