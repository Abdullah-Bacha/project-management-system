'use client'

import { useRef, useState } from 'react'
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react'
import { templatesService } from '@/services/templates.service'
import { errorMessage } from '@/services/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { TASK_PRIORITIES, TEMPLATE_LIMITS as L, type ProjectTemplate, type TaskBlueprint, type TaskPriority } from '@/types'
import { TemplatePreview } from './TemplatePreview'

interface Row {
  key: number
  title: string
  description: string
  priority: TaskPriority
  /** Kept as text so a half-typed number is not rewritten under the cursor. */
  offset: string
}

const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }

interface TemplateFormProps {
  /** Present when editing; absent when creating. */
  template?: ProjectTemplate
  onClose: () => void
  onSaved: (template: ProjectTemplate, mode: 'created' | 'updated') => void
}

/**
 * Create or edit a template. Nothing here touches a real project or task: the
 * rows are only blueprints held in this form until "Save template".
 */
export function TemplateForm({ template, onClose, onSaved }: TemplateFormProps) {
  const nextKey = useRef(0)
  const newRow = (b?: TaskBlueprint): Row => ({
    key: nextKey.current++,
    title: b?.title ?? '',
    description: b?.description ?? '',
    priority: b?.priority ?? 'medium',
    offset: b?.dueOffsetDays === undefined ? '' : String(b.dueOffsetDays),
  })

  const [name, setName] = useState(template?.name ?? '')
  const [category, setCategory] = useState(template?.category ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [projectDescription, setProjectDescription] = useState(template?.projectDescription ?? '')
  const [requirements, setRequirements] = useState(template?.requirements ?? '')
  const [rows, setRows] = useState<Row[]>(() => (template?.tasks ?? []).map((b) => newRow(b)))
  const [step, setStep] = useState<'edit' | 'preview'>('edit')
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const update = (key: number, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  /** Mirrors the API's rules so mistakes show inline; the server still checks everything. */
  const validate = () => {
    const next: Record<string, string> = {}
    const trimmed = name.trim()
    if (!trimmed) next.name = 'Template name is required'
    else if (trimmed.length < L.name.min) next.name = `Name must be at least ${L.name.min} characters`
    else if (trimmed.length > L.name.max) next.name = `Name must be at most ${L.name.max} characters`
    for (const r of rows) {
      const t = r.title.trim()
      if (t.length < L.taskTitle.min) next[`title-${r.key}`] = t ? `At least ${L.taskTitle.min} characters` : 'Task title is required'
      if (r.offset.trim() !== '') {
        const n = Number(r.offset)
        if (!Number.isInteger(n) || n < L.dueOffsetDays.min || n > L.dueOffsetDays.max) {
          next[`offset-${r.key}`] = `Whole days, ${L.dueOffsetDays.min}–${L.dueOffsetDays.max}`
        }
      }
    }
    if (rows.length > L.tasks) next.tasks = `A template can have at most ${L.tasks} tasks`
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const blueprints: TaskBlueprint[] = rows.map((r) => ({
    title: r.title.trim(),
    ...(r.description.trim() && { description: r.description.trim() }),
    priority: r.priority,
    ...(r.offset.trim() !== '' && Number.isInteger(Number(r.offset)) && { dueOffsetDays: Number(r.offset) }),
  }))

  const payload = () => ({
    name: name.trim(),
    category: category.trim() || undefined,
    description: description.trim() || undefined,
    projectDescription: projectDescription.trim() || undefined,
    requirements: requirements.trim() || undefined,
    tasks: blueprints,
  })

  const save = async () => {
    if (saving) return // a second click while the first is in flight does nothing
    if (!validate()) {
      setStep('edit')
      return
    }
    setSaving(true)
    setApiError(null)
    try {
      const saved = template ? await templatesService.update(template._id, payload()) : await templatesService.create(payload())
      onSaved(saved, template ? 'updated' : 'created')
    } catch (e) {
      setApiError(errorMessage(e, 'Could not save the template'))
      setStep('edit')
      setSaving(false)
    }
  }

  return (
    <Modal title={template ? 'Edit template' : 'New template'} placement="right" onClose={saving ? () => {} : onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {apiError && (
          <p role="alert" className="mb-4 rounded-lg bg-critical-subtle px-3 py-2 text-sm text-critical-strong">
            {apiError}
          </p>
        )}

        {step === 'preview' ? (
          <TemplatePreview
            name={name.trim()}
            category={category.trim()}
            description={description.trim()}
            projectDescription={projectDescription.trim()}
            requirements={requirements.trim()}
            tasks={blueprints}
          />
        ) : (
          <form
            id="template-form"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
            className="space-y-4"
            noValidate
          >
            <Input label="Template name" name="template-name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={L.name.max + 20} placeholder="Website launch" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Category (optional)" name="template-category" value={category} onChange={(e) => setCategory(e.target.value)} maxLength={L.category} placeholder="Web" />
              <Input label="Short description" name="template-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={L.description} placeholder="When to use this template" />
            </div>
            <Textarea label="Project description" name="template-project-description" rows={2} value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} maxLength={L.projectDescription} placeholder="Filled into new projects" />
            <Textarea label="Requirements" name="template-requirements" rows={2} value={requirements} onChange={(e) => setRequirements(e.target.value)} maxLength={L.requirements} />

            <fieldset className="space-y-3">
              <legend className="mb-1 flex w-full items-center justify-between text-sm font-medium text-ink-soft">
                <span>
                  Tasks <span className="text-ink-faint">({rows.length}/{L.tasks})</span>
                </span>
              </legend>
              {errors.tasks && <p className="text-xs text-critical-strong">{errors.tasks}</p>}

              {rows.length === 0 && <p className="rounded-xl bg-surface-sunken px-4 py-4 text-center text-sm text-ink-muted">No tasks yet. A template with no tasks creates an empty project.</p>}

              {rows.map((r, i) => (
                <div key={r.key} className="space-y-3 rounded-xl border border-hairline p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <Input label={`Task ${i + 1} title`} name={`task-title-${r.key}`} value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} error={errors[`title-${r.key}`]} maxLength={L.taskTitle.max + 20} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}
                      aria-label={`Remove task ${i + 1}`}
                      className="mt-7 rounded-lg p-2 text-ink-faint transition-colors hover:bg-critical-subtle hover:text-critical-strong"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Textarea label={`Task ${i + 1} description`} name={`task-desc-${r.key}`} rows={2} value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} maxLength={L.taskDescription} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Select label={`Task ${i + 1} priority`} name={`task-priority-${r.key}`} value={r.priority} onChange={(e) => update(r.key, { priority: e.target.value as TaskPriority })}>
                      {TASK_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {PRIORITY_LABEL[p]}
                        </option>
                      ))}
                    </Select>
                    <Input label={`Task ${i + 1} due (days after start)`} name={`task-offset-${r.key}`} type="number" inputMode="numeric" min={L.dueOffsetDays.min} max={L.dueOffsetDays.max} value={r.offset} onChange={(e) => update(r.key, { offset: e.target.value })} error={errors[`offset-${r.key}`]} placeholder="No due date" />
                  </div>
                </div>
              ))}

              <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} disabled={rows.length >= L.tasks} onClick={() => setRows((cur) => [...cur, newRow()])}>
                Add task
              </Button>
            </fieldset>
          </form>
        )}
      </div>

      <footer className="flex shrink-0 flex-wrap gap-3 border-t border-hairline p-4">
        {step === 'preview' ? (
          <Button type="button" variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setStep('edit')} disabled={saving}>
            Back to editing
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            icon={<Eye className="h-4 w-4" />}
            onClick={() => {
              if (validate()) setStep('preview')
            }}
          >
            Preview
          </Button>
        )}
        <Button type="button" onClick={() => void save()} isLoading={saving} className="flex-1">
          Save template
        </Button>
      </footer>
    </Modal>
  )
}
