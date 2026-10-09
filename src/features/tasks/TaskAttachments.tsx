'use client'

import { useRef, useState } from 'react'
import clsx from 'clsx'
import {
  Download,
  File as FileIcon,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Presentation,
  Trash2,
  TriangleAlert,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useLoad } from '@/hooks/useLoad'
import { attachmentsService } from '@/services/attachments.service'
import { errorMessage } from '@/services/client'
import { ACCEPTED_EXTENSIONS, MAX_FILES_PER_REQUEST, checkFile } from '@/lib/attachments'
import { formatBytes, timeAgo } from '@/lib/format'
import type { AttachmentItem, AttachmentKind } from '@/types'

const ICONS: Record<AttachmentKind, typeof FileIcon> = {
  pdf: FileText,
  document: FileText,
  text: FileText,
  image: ImageIcon,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  archive: FileArchive,
}

interface Upload {
  id: number
  name: string
  state: 'uploading' | 'failed'
  error?: string
}

interface TaskAttachmentsProps {
  taskId: string
  /** The task's assignee, or the project owner / team leader. */
  canUpload: boolean
  /** Owner / team leader: may remove any file. Everyone else only their own. */
  canDeleteAny: boolean
  currentUserId?: string
}

/** A task's files: list, add, download, remove. The server decides what each person may do; this only hides what they cannot. */
export function TaskAttachments({ taskId, canUpload, canDeleteAny, currentUserId }: TaskAttachmentsProps) {
  const list = useLoad(() => attachmentsService.list(taskId), [taskId])
  const input = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)
  const [uploads, setUploads] = useState<Upload[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const attachments = list.data?.attachments ?? []
  const uploadsEnabled = list.data?.uploadsEnabled ?? false

  const setUpload = (id: number, patch: Partial<Upload> | null) =>
    setUploads((current) => (patch ? current.map((u) => (u.id === id ? { ...u, ...patch } : u)) : current.filter((u) => u.id !== id)))

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setMessage('')
    const chosen = Array.from(files).slice(0, MAX_FILES_PER_REQUEST)
    if (files.length > MAX_FILES_PER_REQUEST) setMessage(`Add at most ${MAX_FILES_PER_REQUEST} files at a time.`)

    // Each file is its own request: one refusal never affects the others.
    await Promise.all(
      chosen.map(async (file) => {
        const id = nextId.current++
        const early = checkFile({ name: file.name, type: file.type, size: file.size })
        if (!early.ok) {
          setUploads((current) => [...current, { id, name: file.name, state: 'failed', error: early.error }])
          return
        }

        setUploads((current) => [...current, { id, name: file.name, state: 'uploading' }])
        try {
          const result = await attachmentsService.upload(taskId, file)
          list.setData((current) => current && { ...current, attachments: [...result.attachments, ...current.attachments] })
          const refused = result.rejected[0]
          if (refused) setUpload(id, { state: 'failed', error: refused.error })
          else setUpload(id, null)
        } catch (error) {
          setUpload(id, { state: 'failed', error: errorMessage(error, 'Upload failed. Please try again.') })
        }
      })
    )
    if (input.current) input.current.value = ''
  }

  const download = async (item: AttachmentItem) => {
    setBusy(item._id)
    setMessage('')
    try {
      const blob = await attachmentsService.download(taskId, item._id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = item.name
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(errorMessage(error, 'Could not download the file.'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async (item: AttachmentItem) => {
    setBusy(item._id)
    setMessage('')
    try {
      await attachmentsService.remove(taskId, item._id)
      list.setData((current) => current && { ...current, attachments: current.attachments.filter((a) => a._id !== item._id) })
      setConfirming(null)
    } catch (error) {
      setMessage(errorMessage(error, 'Could not delete the file. Please try again.'))
    } finally {
      setBusy(null)
    }
  }

  const canDelete = (item: AttachmentItem) => canDeleteAny || (Boolean(currentUserId) && item.uploadedBy?._id === currentUserId)
  const uploading = uploads.some((u) => u.state === 'uploading')

  return (
    <section aria-labelledby="attachments-title" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="attachments-title" className="flex items-center gap-1.5 text-sm font-medium text-ink-soft">
          <Paperclip className="h-4 w-4 text-ink-faint" />
          Attachments
          {attachments.length > 0 && <span className="text-ink-faint">({attachments.length})</span>}
        </h3>

        {canUpload && uploadsEnabled && (
          <>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              accept={ACCEPTED_EXTENSIONS}
              aria-label="Choose files to attach"
              onChange={(e) => void addFiles(e.target.files)}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              isLoading={uploading}
              icon={<Upload className="h-4 w-4" />}
              onClick={() => input.current?.click()}
            >
              Add files
            </Button>
          </>
        )}
      </div>

      {canUpload && !uploadsEnabled && list.data && (
        <p className="rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
          File uploads are not available on this server yet. Existing files can still be opened.
        </p>
      )}

      {uploads.length > 0 && (
        <ul className="space-y-1.5" aria-live="polite">
          {uploads.map((u) => (
            <li
              key={u.id}
              className={clsx(
                'flex items-start gap-2 rounded-lg px-3 py-2 text-xs',
                u.state === 'failed' ? 'bg-critical-subtle text-critical-strong' : 'bg-surface-sunken text-ink-muted'
              )}
            >
              {u.state === 'uploading' ? (
                <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
              ) : (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{u.name}</span>
                <span>{u.state === 'uploading' ? 'Uploading…' : u.error}</span>
              </span>
              {u.state === 'failed' && (
                <button
                  type="button"
                  className="shrink-0 font-medium underline"
                  aria-label={`Dismiss message for ${u.name}`}
                  onClick={() => setUpload(u.id, null)}
                >
                  Dismiss
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {message && (
        <p role="alert" className="text-xs text-critical-strong">
          {message}
        </p>
      )}

      {list.loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading attachments">
          <div className="skeleton h-12 rounded-xl" />
        </div>
      ) : !list.data ? (
        <p role="alert" className="text-xs text-critical-strong">
          Unable to load attachments.{' '}
          <button type="button" className="font-medium underline" onClick={() => void list.reload()}>
            Try again
          </button>
        </p>
      ) : attachments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-hairline px-4 py-5 text-center">
          <p className="text-sm font-medium text-ink-soft">No attachments yet</p>
          <p className="mt-0.5 text-xs text-ink-muted">Add files related to this task to keep everything in one place.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {attachments.map((item) => {
            const Icon = ICONS[item.kind] ?? FileIcon
            return (
              <li key={item._id} className="rounded-xl border border-hairline bg-surface p-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" title={item.name}>
                      {item.name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-muted">
                      {formatBytes(item.size)}
                      {item.uploadedBy && ` · ${item.uploadedBy.name}`} · {timeAgo(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void download(item)}
                      disabled={busy === item._id}
                      aria-label={`Download ${item.name}`}
                      title="Download"
                      className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink disabled:opacity-50"
                    >
                      {busy === item._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </button>
                    {canDelete(item) && (
                      <button
                        type="button"
                        onClick={() => setConfirming(confirming === item._id ? null : item._id)}
                        aria-label={`Delete ${item.name}`}
                        title="Delete"
                        className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-critical-subtle hover:text-critical-strong"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {confirming === item._id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-critical-subtle px-3 py-2">
                    <p className="flex-1 text-xs text-ink">Delete this file?</p>
                    <Button size="sm" variant="danger" isLoading={busy === item._id} onClick={() => void remove(item)}>
                      Delete
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
