'use client'

import { useRef, useState } from 'react'
import { Paperclip, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ACCEPTED_EXTENSIONS, checkFile, MAX_ATTACHMENT_MB } from '@/lib/attachments'
import { RESOURCE_LIMITS } from '@/lib/project-resources'
import { formatBytes } from '@/lib/format'

/**
 * Choose files before the project exists. They are only held here; they are
 * uploaded once the project has been created. Obviously bad files are refused
 * on the spot (the server checks again).
 */
export function PendingFilesPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [problems, setProblems] = useState<string[]>([])

  const add = (picked: FileList | null) => {
    if (!picked) return
    const next = [...files]
    const issues: string[] = []
    for (const file of Array.from(picked)) {
      const check = checkFile({ name: file.name, type: file.type, size: file.size })
      if (!check.ok) issues.push(`${file.name}: ${check.error}`)
      else if (next.some((f) => f.name === file.name && f.size === file.size)) continue
      else if (next.length >= RESOURCE_LIMITS.files) issues.push(`${file.name}: at most ${RESOURCE_LIMITS.files} files`)
      else next.push(file)
    }
    setProblems(issues)
    onChange(next)
    if (input.current) input.current.value = ''
  }

  return (
    <div>
      <input ref={input} id="project-files" type="file" multiple accept={ACCEPTED_EXTENSIONS} className="sr-only" onChange={(e) => add(e.target.files)} />
      <Button type="button" variant="secondary" size="sm" icon={<Upload className="h-4 w-4" />} onClick={() => input.current?.click()} disabled={files.length >= RESOURCE_LIMITS.files}>
        Add files
      </Button>
      <p className="mt-1.5 text-xs text-ink-faint">PDF, images, Office documents, CSV, TXT or ZIP · up to {MAX_ATTACHMENT_MB} MB each</p>

      {problems.length > 0 && (
        <ul role="alert" className="mt-2 space-y-0.5 text-xs text-critical-strong">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-3 space-y-2">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`} className="flex items-center gap-3 rounded-xl border border-hairline px-3 py-2">
              <Paperclip className="h-4 w-4 shrink-0 text-ink-faint" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{f.name}</span>
                <span className="block text-xs text-ink-muted">{formatBytes(f.size)}</span>
              </span>
              <button
                type="button"
                onClick={() => onChange(files.filter((x) => x !== f))}
                aria-label={`Remove ${f.name}`}
                className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-critical-subtle hover:text-critical-strong"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
