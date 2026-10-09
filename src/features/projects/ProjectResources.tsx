'use client'

import { useRef, useState } from 'react'
import {
  Download,
  ExternalLink,
  File as FileIcon,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Figma,
  Globe,
  Image as ImageIcon,
  Layers,
  Plus,
  Presentation,
  Trash2,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { StatsCard } from '@/components/ui/StatsCard'
import { useRealtimeData } from '@/hooks/useRealtimeData'
import { projectResourcesService } from '@/services/project-files.service'
import { errorMessage } from '@/services/client'
import { ACCEPTED_EXTENSIONS, MAX_FILES_PER_REQUEST, MAX_ATTACHMENT_MB } from '@/lib/attachments'
import { RESOURCE_LIMITS, hostOf, isFigma, linkTitle, normalizeUrl } from '@/lib/project-resources'
import { formatBytes, timeAgo } from '@/lib/format'
import type { AttachmentKind, Project, ProjectFileList, ReferenceLink } from '@/types'

const ICONS: Record<AttachmentKind, typeof FileIcon> = {
  pdf: FileText,
  document: FileText,
  text: FileText,
  image: ImageIcon,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  archive: FileArchive,
}

interface ProjectResourcesProps {
  project: Project
  /** Owner or team leader: may add and remove. Everyone else on the project can open and download. */
  canEdit: boolean
  onLinksChanged: (links: ReferenceLink[]) => void
}

/**
 * The project's reference material (the expected website, a Figma design,
 * files): one card, and a drawer with everything. The owner, the team leader
 * and the developers on the team can all open it; only the owner and team
 * leader can change it (the server decides, this only hides what they cannot).
 */
export function ProjectResources({ project, canEdit, onLinksChanged }: ProjectResourcesProps) {
  const [open, setOpen] = useState(false)
  const links = project.referenceLinks ?? []

  const files = useRealtimeData<ProjectFileList>({
    endpoint: `/api/projects/${project._id}/files`,
    watch: ['projectfiles'],
    match: (signal) => signal.projectId === project._id,
  })
  const fileList = files.data?.files ?? []

  const hint =
    links.length + fileList.length === 0
      ? files.data
        ? 'Nothing shared yet'
        : 'Loading…'
      : `${links.length} ${links.length === 1 ? 'link' : 'links'} · ${fileList.length} ${fileList.length === 1 ? 'file' : 'files'}`

  return (
    <>
      <StatsCard
        label="Resources"
        value={files.data ? links.length + fileList.length : links.length || '—'}
        hint={hint}
        icon={<Layers className="h-5 w-5" />}
        tone="brand"
        onClick={() => setOpen(true)}
      />
      {open && (
        <ResourcesDrawer
          project={project}
          links={links}
          files={fileList}
          uploadsEnabled={files.data?.uploadsEnabled ?? true}
          canEdit={canEdit}
          onLinksChanged={onLinksChanged}
          reloadFiles={files.refetch}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ResourcesDrawer({
  project,
  links,
  files,
  uploadsEnabled,
  canEdit,
  onLinksChanged,
  reloadFiles,
  onClose,
}: {
  project: Project
  links: ReferenceLink[]
  files: ProjectFileList['files']
  uploadsEnabled: boolean
  canEdit: boolean
  onLinksChanged: (links: ReferenceLink[]) => void
  reloadFiles: () => Promise<void>
  onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null)

  const saveLinks = async (next: ReferenceLink[], busyKey: string) => {
    setBusy(busyKey)
    setMessage(null)
    try {
      onLinksChanged(await projectResourcesService.saveLinks(project._id, next))
      return true
    } catch (e) {
      setMessage({ type: 'error', text: errorMessage(e, 'Could not save the links.') })
      return false
    } finally {
      setBusy(null)
    }
  }

  const addLink = async () => {
    const clean = normalizeUrl(url)
    if (!clean) return setUrlError('Enter a valid web address, like https://www.figma.com/file/…')
    if (links.length >= RESOURCE_LIMITS.links) return setUrlError(`A project can have at most ${RESOURCE_LIMITS.links} links.`)
    setUrlError('')
    if (await saveLinks([...links, { url: clean, ...(label.trim() && { label: label.trim() }) }], 'add')) {
      setLabel('')
      setUrl('')
    }
  }

  const upload = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return
    setBusy('upload')
    setMessage(null)
    const problems: string[] = []
    for (const file of Array.from(picked).slice(0, MAX_FILES_PER_REQUEST * 4)) {
      try {
        const result = await projectResourcesService.uploadFile(project._id, file)
        result.rejected.forEach((r) => problems.push(`${r.name}: ${r.error}`))
      } catch (e) {
        problems.push(`${file.name}: ${errorMessage(e, 'upload failed')}`)
      }
    }
    await reloadFiles()
    if (input.current) input.current.value = ''
    setMessage(problems.length ? { type: 'error', text: problems.join(' · ') } : null)
    setBusy(null)
  }

  const download = async (id: string, name: string) => {
    setBusy(id)
    setMessage(null)
    try {
      const blob = await projectResourcesService.downloadFile(project._id, id)
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch (e) {
      setMessage({ type: 'error', text: errorMessage(e, 'Could not download the file.') })
    } finally {
      setBusy(null)
    }
  }

  const removeFile = async (id: string) => {
    setBusy(id)
    setMessage(null)
    try {
      await projectResourcesService.removeFile(project._id, id)
      await reloadFiles()
    } catch (e) {
      setMessage({ type: 'error', text: errorMessage(e, 'Could not delete the file.') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal title="Resources" placement="right" onClose={onClose}>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
        {message && (
          <p role="alert" className={`rounded-lg px-3 py-2 text-sm ${message.type === 'error' ? 'bg-critical-subtle text-critical-strong' : 'bg-surface-sunken text-ink-muted'}`}>
            {message.text}
          </p>
        )}

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">
            Reference links <span className="font-normal text-ink-faint">({links.length})</span>
          </h3>
          {links.length === 0 ? (
            <p className="rounded-xl bg-surface-sunken px-4 py-4 text-center text-sm text-ink-muted">No links yet.</p>
          ) : (
            <ul className="space-y-2">
              {links.map((l, i) => {
                const Icon = isFigma(l.url) ? Figma : Globe
                return (
                  <li key={`${l.url}-${i}`} className="flex items-center gap-3 rounded-xl border border-hairline p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="group min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-ink group-hover:text-interactive">
                        <span className="truncate">{linkTitle(l)}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                      </span>
                      <span className="block truncate text-xs text-ink-muted">{l.label ? hostOf(l.url) : l.url}</span>
                    </a>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void saveLinks(links.filter((_, j) => j !== i), `link-${i}`)}
                        aria-label={`Remove ${linkTitle(l)}`}
                        className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-critical-subtle hover:text-critical-strong disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {canEdit && (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault()
                void addLink()
              }}
              className="mt-3 space-y-3 rounded-xl border border-dashed border-hairline p-3"
            >
              <Input label="Name (optional)" value={label} maxLength={RESOURCE_LIMITS.linkLabel} placeholder="Figma design" onChange={(e) => setLabel(e.target.value)} />
              <Input label="Web address" type="text" inputMode="url" value={url} maxLength={RESOURCE_LIMITS.linkUrl} placeholder="https://www.figma.com/file/…" error={urlError} onChange={(e) => setUrl(e.target.value)} />
              <Button type="submit" size="sm" variant="secondary" icon={<Plus className="h-4 w-4" />} isLoading={busy === 'add'} disabled={busy !== null && busy !== 'add'}>
                Add link
              </Button>
            </form>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">
            Files <span className="font-normal text-ink-faint">({files.length})</span>
          </h3>
          {files.length === 0 ? (
            <p className="rounded-xl bg-surface-sunken px-4 py-4 text-center text-sm text-ink-muted">No files yet.</p>
          ) : (
            <ul className="space-y-2">
              {files.map((f) => {
                const Icon = ICONS[f.kind] ?? FileIcon
                return (
                  <li key={f._id} className="flex items-center gap-3 rounded-xl border border-hairline p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{f.name}</span>
                      <span className="block text-xs text-ink-muted">
                        {formatBytes(f.size)}
                        {f.uploadedBy ? ` · ${f.uploadedBy.name}` : ''} · {timeAgo(f.createdAt)}
                      </span>
                    </span>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void download(f._id, f.name)}
                      aria-label={`Download ${f.name}`}
                      className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-40"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void removeFile(f._id)}
                        aria-label={`Delete ${f.name}`}
                        className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-critical-subtle hover:text-critical-strong disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {canEdit && (
            <div className="mt-3">
              <input ref={input} type="file" multiple accept={ACCEPTED_EXTENSIONS} className="sr-only" onChange={(e) => void upload(e.target.files)} />
              <Button type="button" size="sm" variant="secondary" icon={<Upload className="h-4 w-4" />} isLoading={busy === 'upload'} disabled={!uploadsEnabled || (busy !== null && busy !== 'upload') || files.length >= RESOURCE_LIMITS.files} onClick={() => input.current?.click()}>
                Add files
              </Button>
              {!uploadsEnabled && <p className="mt-1.5 text-xs text-caution-strong">File storage is not set up on this server, so files cannot be added yet. Links still work.</p>}
              <p className="mt-1.5 text-xs text-ink-faint">PDF, images, Office documents, CSV, TXT or ZIP · up to {MAX_ATTACHMENT_MB} MB each</p>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}
