import clsx from 'clsx'
import type { PresenceEntry } from '@/services/presence.service'

/** "Jan 5, 2026, 3:04 PM" in the viewer's time zone; the stored time is UTC. */
const formatSeen = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/**
 * Whether a person has a TaskFlow tab open right now: a green dot and "Online", or a grey dot,
 * "Offline" and when they were last seen. Written out as text, so colour is not the only signal.
 */
export function PresenceBadge({ presence }: { presence?: PresenceEntry }) {
  if (!presence) {
    // Not loaded yet (or it could not be): say nothing rather than guess.
    return <span className="inline-block h-4 w-24 animate-pulse rounded bg-surface-sunken" aria-hidden />
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      <span
        aria-hidden
        className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', presence.online ? 'bg-positive shadow-[0_0_0_3px] shadow-positive/20' : 'bg-ink-faint')}
      />
      <span className={clsx('font-medium', presence.online ? 'text-positive-strong' : 'text-ink-muted')}>{presence.online ? 'Online' : 'Offline'}</span>
      {!presence.online && (
        <span className="min-w-0 truncate text-ink-faint" title={presence.lastSeenAt ? new Date(presence.lastSeenAt).toISOString() : undefined}>
          · {presence.lastSeenAt ? `Last seen: ${formatSeen(presence.lastSeenAt)}` : 'Never seen'}
        </span>
      )}
    </div>
  )
}
