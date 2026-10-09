import { PresenceSession, User } from '@/lib/db/models'
import { LEAVE_GRACE_MS, MAX_TABS_PER_USER, STALE_MS, onlineUserIds, presenceCounts } from '@/lib/presence'

const DAY_MS = 86_400_000

export type BeatResult = { ok: true } | { ok: false; status: 429; error: string }

/**
 * A signed-in tab says "still here". The person is whoever the verified token
 * says (never something the client sends); the client only supplies which of
 * its own tabs this is. The same tab id after a page refresh simply reopens
 * the same session, so a refresh is not a new tab.
 */
export async function recordBeat(params: { userId: string; tabId: string; now?: Date }): Promise<BeatResult> {
  const { userId, tabId } = params
  const now = params.now ?? new Date()

  // A person may have a reasonable number of tabs open; a new one past that is refused.
  const known = await PresenceSession.exists({ userId, tabId })
  if (!known) {
    const open = await PresenceSession.countDocuments({
      userId,
      leftAt: { $exists: false },
      lastBeatAt: { $gte: new Date(now.getTime() - STALE_MS) },
    })
    if (open >= MAX_TABS_PER_USER) return { ok: false, status: 429, error: 'Too many open tabs' }
  }

  await Promise.all([
    PresenceSession.updateOne(
      { userId, tabId },
      { $set: { lastBeatAt: now, expiresAt: new Date(now.getTime() + DAY_MS) }, $unset: { leftAt: 1 } },
      { upsert: true }
    ),
    // "Last seen" stays accurate even if the tab later disappears without a goodbye.
    // `timestamps: false`: seeing someone is not an edit of their account, so `updatedAt` must not move.
    User.updateOne({ _id: userId }, { $set: { lastSeenAt: now } }, { timestamps: false }),
  ])
  return { ok: true }
}

/** A tab says goodbye (closed, or the person signed out). Only their own tab can be closed this way. */
export async function recordLeave(params: { userId: string; tabId: string; now?: Date }) {
  const { userId, tabId } = params
  const now = params.now ?? new Date()

  const closed = await PresenceSession.updateOne({ userId, tabId, leftAt: { $exists: false } }, { $set: { leftAt: now, expiresAt: new Date(now.getTime() + DAY_MS) } })
  if (closed.modifiedCount > 0) await User.updateOne({ _id: userId }, { $set: { lastSeenAt: now } }, { timestamps: false })
}

export interface PresenceEntry {
  _id: string
  online: boolean
  /** UTC ISO time; null if the person has never opened TaskFlow since presence was added. */
  lastSeenAt: string | null
}

export interface PresenceReport {
  /** The server's clock (UTC ISO), so a screen can show how fresh this is. */
  at: string
  users: PresenceEntry[]
  counts: { online: number; offline: number }
}

/**
 * Who is online right now, for the admin. One query for the connected tabs and
 * one for the people; the answer is computed from the clock, so a tab that
 * stopped reporting turns Offline by itself.
 */
export async function getPresence(now: Date = new Date()): Promise<PresenceReport> {
  const nowMs = now.getTime()
  const [sessions, users] = await Promise.all([
    PresenceSession.find({
      $or: [
        { leftAt: { $exists: false }, lastBeatAt: { $gte: new Date(nowMs - STALE_MS) } },
        { leftAt: { $gte: new Date(nowMs - LEAVE_GRACE_MS) } },
      ],
    })
      .select('userId lastBeatAt leftAt')
      .lean(),
    User.find().select('lastSeenAt').lean(),
  ])

  const online = onlineUserIds(sessions as any[], nowMs)
  const ids = (users as any[]).map((u) => String(u._id))

  return {
    at: now.toISOString(),
    users: (users as any[]).map((u) => ({
      _id: String(u._id),
      online: online.has(String(u._id)),
      lastSeenAt: u.lastSeenAt ? new Date(u.lastSeenAt).toISOString() : null,
    })),
    counts: presenceCounts(ids, online),
  }
}
