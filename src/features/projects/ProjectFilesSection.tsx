'use client'

import { useRef, useState } from 'react'
import { Download, File as FileIcon, FileArchive, FileSpreadsheet, FileText, Image as ImageIcon, Paperclip, Presentation, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLoad } from '@/hooks/useLoad'
import { projectResourcesService } from '@/services/project-files.service'
import { errorMessage } from '@/services/client'
import { ACCEPTED_EXTENSIONS, checkFile, MAX_ATTACHMENT_MB } from '@/lib/attachments'
import { RESOURCE_LIMITS } from '@/lib/project-resources'
import { formatBytes, timeAgo } from '@/lib/format'
import type { AttachmentKind } from '@/types'

const ICONS: Record<AttachmentKind, typeof FileIcon> = {
  pdf: FileText,
  document: FileText,
  text: FileText,
  image: ImageIcon,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  archive: FileArchive,
}

/**
 * A project's shared files, managed in place: the list, add (uploaded at once),
 * download and delete. For the project's owner and team leader; the server
 * refuses everyone else. Saved independently of the rest of the edit form.
 */
export function ProjectFilesSection({ projectId }: { projectId: string }) {
  const list = useLoad(() => projectResourcesService.listFiles(projectId), [projectId])
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [problems, setProblems] = useState<string[]>([])

  const files = list.data?.files ?? []
  const uploadsEnabled = list.data?.uploadsEnabled ?? true

  const upload = async (picked: FileList | null) => {
    if (!picked || picked.length === 0) return
    setBusy('upload')
    const issues: string[] = []
    for (const file of Array.from(picked)) {
      if (files.length >= RESOURCE_LIMITS.files) {
        issues.push(`${file.name}: a project can have at most ${RESOURCE_LIMITS.files} shared files`)
        continue
      }
      const check = checkFile({ name: file.name, type: file.type, size: file.size })
      if (!check.ok) {
        issues.push(`${file.name}: ${check.error}`)
        continue
      }
      try {
        const result = await projectResourcesService.uploadFile(projectId, file)
        result.rejected.forEach((r) => issues.push(`${r.name}: ${r.error}`))
      } catch (e) {
        issues.push(`${file.name}: ${errorMessage(e, 'upload failed')}`)
      }
    }
    setProblems(issues)
    await list.reload()
    if (input.current) input.current.value = ''
    setBusy(null)
  }

  const download = async (id: string, name: string) => {
    setBusy(id)
    setProblems([])
    try {
      const blob = await projectResourcesService.downloadFile(projectId, id)
      const href = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = href
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(href)
    } catch (e) {
      setProblems([errorMessage(e, 'Could not download the file.')])
    } finally {
      setBusy(null)
    }
  }

  const remove = async (id: string) => {
    setBusy(id)
    setProblems([])
    try {
      await projectResourcesService.removeFile(projectId, id)
      await list.reload()
    } catch (e) {
      setProblems([errorMessage(e, 'Could not delete the file.')])
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Paperclip className="h-4 w-4 text-ink-faint" />
        Files <span className="font-normal text-ink-faint">({files.length})</span>
      </h3>

      {list.loading ? (
        <div className="skeleton h-14 rounded-xl" aria-busy="true" aria-label="Loading files" />
      ) : list.error && !list.data ? (
        <p className="text-sm text-critical-strong">
          Could not load the files.{' '}
          <button type="button" onClick={() => void list.reload()} className="font-medium underline">
            Try again
          </button>
        </p>
      ) : files.length === 0 ? (
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
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void remove(f._id)}
                  aria-label={`Delete ${f.name}`}
                  className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-critical-subtle hover:text-critical-strong disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {problems.length > 0 && (
        <ul role="alert" className="space-y-0.5 text-xs text-critical-strong">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div>
        <input ref={input} type="file" multiple accept={ACCEPTED_EXTENSIONS} className="sr-only" onChange={(e) => void upload(e.target.files)} />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          icon={<Upload className="h-4 w-4" />}
          isLoading={busy === 'upload'}
          disabled={!uploadsEnabled || (busy !== null && busy !== 'upload') || files.length >= RESOURCE_LIMITS.files}
          onClick={() => input.current?.click()}
        >
          Add files
        </Button>
        {!uploadsEnabled && <p className="mt-1.5 text-xs text-caution-strong">File storage is not set up on this server, so files cannot be added yet. Links still work.</p>}
        <p className="mt-1.5 text-xs text-ink-faint">PDF, images, Office documents, CSV, TXT or ZIP · up to {MAX_ATTACHMENT_MB} MB each · files are saved as soon as you add them</p>
      </div>
    </section>
  )
}
