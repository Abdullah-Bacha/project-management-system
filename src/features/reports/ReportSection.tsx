'use client'

import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { reportsService } from '@/services/reports.service'
import { useLoad } from '@/hooks/useLoad'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Toast } from '@/components/ui/Toast'
import type { ProjectAnalytics } from '@/types'
import { errorMessage } from '@/services/client'

interface ReportSectionProps {
  projectId: string
  analytics: ProjectAnalytics
  /** Team leaders (and the owning admin) may send reports; members only read them. */
  canSend: boolean
}

/** The project's progress reports to admin, and — for editors — the form to send one. */
export function ReportSection({ projectId, analytics, canSend }: ReportSectionProps) {
  const reports = useLoad(() => reportsService.listForProject(projectId), [projectId])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ type: 'error' | 'success'; message: string } | null>(null)

  const handleSend = async () => {
    setSending(true)
    try {
      await reportsService.submit(projectId, note.trim() || undefined)
      setToast({ type: 'success', message: 'Report sent to admin' })
      setNote('')
      await reports.reload()
    } catch (e) {
      setToast({ type: 'error', message: errorMessage(e, 'Failed to send report') })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="mt-6 rounded-card border border-hairline bg-surface p-6 shadow-card">
      <h2 className="font-semibold text-ink">Progress reports</h2>
      <p className="mt-1 text-sm text-ink-muted">
        {canSend
          ? "Send admin a snapshot of today's progress on this project."
          : "Your team leader's progress updates to admin."}
      </p>

      {canSend && (
        <div className="mt-4 rounded-xl border border-hairline bg-surface-sunken/50 p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-ink-soft">
              <Strong>{analytics.completedTasks}</Strong> of <Strong>{analytics.totalTasks}</Strong>{' '}
              tasks complete
            </span>
            <span className="text-ink-soft">
              <Strong>{analytics.completionRate}%</Strong> overall
            </span>
            <span className="text-ink-soft">
              <Strong>{analytics.totalTasks - analytics.completedTasks}</Strong> remaining
            </span>
          </div>

          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note for admin (optional)…"
            rows={2}
            className="mt-3 py-2.5"
          />

          <div className="mt-3">
            <Button onClick={handleSend} isLoading={sending} icon={<Send className="h-4 w-4" />}>
              Send report to admin
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-hairline pt-4">
        {reports.loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading reports…
          </div>
        ) : reports.error ? (
          <p className="py-3 text-sm text-critical-strong">
            Could not load reports.{' '}
            <button onClick={reports.reload} className="font-medium underline">
              Try again
            </button>
          </p>
        ) : !reports.data?.length ? (
          <p className="py-3 text-sm text-ink-faint">No reports sent yet.</p>
        ) : (
          <ul className="space-y-3">
            {reports.data.map((r) => (
              <li key={r._id} className="rounded-xl bg-surface-sunken px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{r.submittedBy?.name}</span>
                  <span className="text-xs text-ink-faint">
                    {new Date(r.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1 text-sm text-ink-soft">
                  {r.completedToday?.length ?? 0} task(s) completed that day — {r.completionRate}%
                  overall ({r.completedTasks}/{r.totalTasks})
                </p>
                {r.note && (
                  <p className="mt-1.5 whitespace-pre-line text-sm text-ink-muted">“{r.note}”</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </section>
  )
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-semibold text-ink tabular-nums">{children}</span>
}

