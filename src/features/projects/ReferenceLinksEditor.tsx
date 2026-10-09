'use client'

import { useRef } from 'react'
import { Link2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { RESOURCE_LIMITS as L, normalizeUrl } from '@/lib/project-resources'
import type { ReferenceLink } from '@/types'

/** A link as typed: the address may still be half written, so it is only cleaned when saved. */
export interface LinkRow {
  key: number
  label: string
  url: string
}

let nextKey = 0
export const newLinkRow = (link?: ReferenceLink): LinkRow => ({ key: nextKey++, label: link?.label ?? '', url: link?.url ?? '' })

/** The error for each row that has a bad address (rows left completely empty are ignored). */
export function linkErrors(rows: LinkRow[]): Record<number, string> {
  const errors: Record<number, string> = {}
  for (const r of rows) {
    if (!r.url.trim() && !r.label.trim()) continue
    if (!r.url.trim()) errors[r.key] = 'Enter the web address'
    else if (!normalizeUrl(r.url)) errors[r.key] = 'Enter a valid web address, like https://www.figma.com/file/…'
  }
  return errors
}

/** The links to send: cleaned addresses, empty rows dropped. */
export function rowsToLinks(rows: LinkRow[]): ReferenceLink[] {
  return rows.flatMap((r) => {
    const url = normalizeUrl(r.url)
    return url ? [{ url, ...(r.label.trim() && { label: r.label.trim() }) }] : []
  })
}

/** Rows for "the expected website" and "the Figma design": a name (optional) and an address each. */
export function ReferenceLinksEditor({ rows, onChange, errors }: { rows: LinkRow[]; onChange: (rows: LinkRow[]) => void; errors: Record<number, string> }) {
  const idPrefix = useRef(`link-${nextKey++}`).current
  const update = (key: number, patch: Partial<LinkRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.key} className="rounded-xl border border-hairline p-3">
          <div className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-5">
              <div className="sm:col-span-2">
                <Input
                  label={`Link ${i + 1} name (optional)`}
                  id={`${idPrefix}-label-${r.key}`}
                  value={r.label}
                  maxLength={L.linkLabel}
                  placeholder="Figma design"
                  onChange={(e) => update(r.key, { label: e.target.value })}
                />
              </div>
              <div className="sm:col-span-3">
                <Input
                  label={`Link ${i + 1} address`}
                  id={`${idPrefix}-url-${r.key}`}
                  inputMode="url"
                  value={r.url}
                  maxLength={L.linkUrl}
                  placeholder="https://www.figma.com/file/…"
                  icon={<Link2 className="h-4 w-4" />}
                  error={errors[r.key]}
                  onChange={(e) => update(r.key, { url: e.target.value })}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
              aria-label={`Remove link ${i + 1}`}
              className="mt-7 rounded-lg p-2 text-ink-faint transition-colors hover:bg-critical-subtle hover:text-critical-strong"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} disabled={rows.length >= L.links} onClick={() => onChange([...rows, newLinkRow()])}>
        Add link
      </Button>
    </div>
  )
}
