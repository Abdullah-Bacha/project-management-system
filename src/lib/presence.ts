/**
 * Online / offline presence, tab by tab.
 *
 * A person is ONLINE while at least one signed-in TaskFlow tab of theirs is
 * connected. Each tab keeps a "session" alive with a small heartbeat; closing
 * the tab (or signing out) says goodbye explicitly, and a tab that vanishes
 * without saying so (crash, power loss, network drop) expires on its own.
 * Nothing here looks at mouse or keyboard activity.
 */

/** How often an open tab says "still here". */
export const HEARTBEAT_MS = 20_000
/**
 * A tab that has not been heard from for this long is gone. It is well above the
 * heartbeat because browsers slow the timers of tabs in the background (a tab
 * hidden for minutes may only run its timers about once a minute).
 */
export const STALE_MS = 90_000
/**
 * After a tab says goodbye it still counts as connected for a few seconds, so a
 * page refresh (goodbye, then the same tab reconnects almost at once) does not
 * flash "Offline". Closing the tab for good turns Offline once this passes.
 */
export const LEAVE_GRACE_MS = 8_000
/** Open tabs one person may register (a guard against a runaway client). */
export const MAX_TABS_PER_USER = 25

/** A tab's id: random, made by the browser, one per tab (kept across refreshes). */
export const TAB_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/

export interface SessionLike {
  userId: unknown
  lastBeatAt: Date | string | number
  leftAt?: Date | string | number | null
}

const ms = (value: Date | string | number) => new Date(value).getTime()

/** Is this one tab connected right now? */
export function isSessionConnected(session: Pick<SessionLike, 'lastBeatAt' | 'leftAt'>, now: number): boolean {
  if (session.leftAt) return now - ms(session.leftAt) <= LEAVE_GRACE_MS
  return now - ms(session.lastBeatAt) <= STALE_MS
}

/** The ids of the people with at least one connected tab. */
export function onlineUserIds(sessions: SessionLike[], now: number): Set<string> {
  const online = new Set<string>()
  for (const s of sessions) if (isSessionConnected(s, now)) online.add(String((s.userId as any)?._id ?? s.userId))
  return online
}

/** How many of the given people are online, and how many are not. */
export function presenceCounts(userIds: string[], online: Set<string>) {
  const onlineCount = userIds.filter((id) => online.has(id)).length
  return { online: onlineCount, offline: userIds.length - onlineCount }
}
