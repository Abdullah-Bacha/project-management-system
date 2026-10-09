import type mongoose from 'mongoose'
import { connectToDatabase } from '@/lib/db/mongodb'
import { Project, Task } from '@/lib/db/models'
import type { ChangeSignal } from '@/types'

/**
 * Server-side change bus: one MongoDB change stream, filtered per client.
 *
 * Clients receive only a small "something changed" signal — ids, never
 * document content — and refetch through the normal authorized APIs, so
 * authorization stays where it is. The bus additionally decides WHO gets each
 * signal, so a client never hears about other people's work:
 *
 *   notifications → only the notification's owner
 *   projects      → members of that project (a removed member gets one last
 *                   signal so their UI can drop it)
 *   tasks         → members of the task's project
 *   comments      → members of the comment's task's project
 *   teams         → the team's leader, members and creator
 *   activities    → members of that project (the feed refetches through the
 *                   authorized API, which decides what each member may see)
 *
 * Administrators additionally hear about every project and team (the signal is
 * only ids, and an administrator may read all of it through the APIs anyway).
 * Collections nothing in the UI listens to (users, reports) are not watched.
 */
interface Subscriber {
  userId: string
  /** Ids of the projects this user is currently a member of. */
  projectIds: Set<string>
  /** Administrators work across every project and team (Reports, Team Workload), so they hear about all of them. */
  isAdmin: boolean
  send: (signal: ChangeSignal) => void
}

interface BusState {
  subscribers: Set<Subscriber>
  stream: mongoose.mongo.ChangeStream | null
  starting: Promise<void> | null
  retryTimer: ReturnType<typeof setTimeout> | null
  retryDelay: number
  /** taskId → projectId, so a burst of comments costs one lookup. */
  taskProjects: Map<string, string>
}

// Cached on global so dev-mode HMR reloads reuse the one stream instead of
// leaking a new one per reload — same pattern as the mongoose connection.
declare global {
  var _realtimeBusV2: BusState | undefined
}

const bus: BusState = global._realtimeBusV2 ?? {
  subscribers: new Set(),
  stream: null,
  starting: null,
  retryTimer: null,
  retryDelay: 1000,
  taskProjects: new Map(),
}
global._realtimeBusV2 = bus

const WATCHED = ['projects', 'tasks', 'comments', 'notifications', 'teams', 'activities', 'messages', 'taskdependencies', 'projectfiles']
const MAX_TASK_CACHE = 1000

const str = (value: unknown) => (value == null ? '' : String(value))

function deliver(sub: Subscriber, signal: ChangeSignal) {
  try {
    sub.send(signal)
  } catch {
    // One bad subscriber must not break delivery to the rest.
  }
}

async function projectIdOfTask(taskId: string): Promise<string | undefined> {
  const cached = bus.taskProjects.get(taskId)
  if (cached) return cached

  const task = await Task.findById(taskId).select('projectId').lean()
  const projectId = task ? str((task as any).projectId) : undefined
  if (projectId) {
    if (bus.taskProjects.size >= MAX_TASK_CACHE) bus.taskProjects.clear()
    bus.taskProjects.set(taskId, projectId)
  }
  return projectId
}

/** Work out who should hear about one change, and tell them. */
async function route(event: any) {
  const collection: string | undefined = event.ns?.coll
  if (!collection || !WATCHED.includes(collection)) return

  const op: string = event.operationType
  const doc = event.fullDocument
  const id = str(event.documentKey?._id)
  const updatedAt = doc?.updatedAt ? new Date(doc.updatedAt).getTime() : undefined
  const base = { collection, op, id, updatedAt }

  switch (collection) {
    case 'notifications': {
      // A deleted notification has no owner on the event; the user who
      // deleted it already knows.
      const owner = str(doc?.userId)
      if (!owner) return
      for (const sub of bus.subscribers) if (sub.userId === owner) deliver(sub, base)
      return
    }

    case 'projects': {
      const memberIds = new Set<string>(
        doc ? [str(doc.owner), ...(doc.members ?? []).map(str)] : []
      )
      const signal = { ...base, projectId: id }

      for (const sub of bus.subscribers) {
        const wasMember = sub.projectIds.has(id)
        const isMember = op !== 'delete' && memberIds.has(sub.userId)

        if (isMember) sub.projectIds.add(id)
        else sub.projectIds.delete(id)

        // Members hear about it; so does someone who just stopped being one.
        if (isMember || wasMember || sub.isAdmin) deliver(sub, signal)
      }
      return
    }

    case 'tasks': {
      const projectId = str(doc?.projectId)
      if (projectId) {
        const signal = { ...base, projectId }
        for (const sub of bus.subscribers) if ((sub.isAdmin || sub.projectIds.has(projectId))) deliver(sub, signal)
      } else {
        // A deletion carries no project. Tasks are deleted rarely, and the
        // signal is only an id: listeners ignore ids they do not hold.
        for (const sub of bus.subscribers) deliver(sub, base)
      }
      return
    }

    case 'comments': {
      const taskId = str(doc?.taskId)
      if (!taskId) return // comments only disappear with their task/project
      const projectId = await projectIdOfTask(taskId)
      if (!projectId) return
      const signal = { ...base, taskId, projectId }
      for (const sub of bus.subscribers) if ((sub.isAdmin || sub.projectIds.has(projectId))) deliver(sub, signal)
      return
    }

    case 'messages': {
      // A direct message concerns only its two participants.
      if (!doc) return
      const people = new Set<string>([str(doc.sender), str(doc.recipient)])
      for (const sub of bus.subscribers) if (people.has(sub.userId)) deliver(sub, base)
      return
    }

    case 'taskdependencies': {
      // Dependencies change what is blocked: tell the project's members (analytics refetch).
      const projectId = str(doc?.projectId)
      if (projectId) {
        const signal = { ...base, projectId }
        for (const sub of bus.subscribers) if ((sub.isAdmin || sub.projectIds.has(projectId))) deliver(sub, signal)
      } else {
        // A removal carries no document; the signal is only an id, so it is safe to broadcast.
        for (const sub of bus.subscribers) deliver(sub, base)
      }
      return
    }

    case 'projectfiles': {
      // Shared files change what a project's members can open: tell them (the list refetches through the authorized API).
      const projectId = str(doc?.projectId)
      if (projectId) {
        const signal = { ...base, projectId }
        for (const sub of bus.subscribers) if (sub.isAdmin || sub.projectIds.has(projectId)) deliver(sub, signal)
      } else {
        // A removal carries no document; the signal is only an id, so it is safe to broadcast.
        for (const sub of bus.subscribers) deliver(sub, base)
      }
      return
    }

    case 'activities': {
      const projectId = str(doc?.projectId)
      if (!projectId) return
      const signal = { ...base, projectId }
      for (const sub of bus.subscribers) if ((sub.isAdmin || sub.projectIds.has(projectId))) deliver(sub, signal)
      return
    }

    case 'teams': {
      if (!doc) return
      const people = new Set<string>([
        str(doc.teamLeader),
        str(doc.createdBy),
        ...(doc.members ?? []).map(str),
      ])
      for (const sub of bus.subscribers) if (sub.isAdmin || people.has(sub.userId)) deliver(sub, base)
      return
    }
  }
}

function teardown() {
  if (bus.retryTimer) {
    clearTimeout(bus.retryTimer)
    bus.retryTimer = null
  }
  const stream = bus.stream
  bus.stream = null
  stream?.close().catch(() => {})
}

function scheduleRetry() {
  if (bus.retryTimer || bus.subscribers.size === 0) return
  bus.retryTimer = setTimeout(() => {
    bus.retryTimer = null
    bus.retryDelay = Math.min(bus.retryDelay * 2, 30000)
    void ensureStream()
  }, bus.retryDelay)
}

async function ensureStream(): Promise<void> {
  if (bus.stream || bus.starting || bus.subscribers.size === 0) return

  bus.starting = (async () => {
    try {
      const conn = await connectToDatabase()

      // One deployment-level stream covers every collection — Atlas free
      // tiers cap concurrent change streams, so never open one per model.
      // 'updateLookup' gives updates their full document, which is how
      // we learn the owner / project / members of a changed record.
      const stream = conn.connection.watch(
        [
          {
            $match: {
              operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
              'ns.coll': { $in: WATCHED },
            },
          },
        ],
        { fullDocument: 'updateLookup' }
      )

      stream.on('change', (event: any) => {
        route(event).catch((err) =>
          console.error('[Realtime] Failed to route change:', err.message)
        )
      })

      stream.on('error', (err: Error) => {
        console.error('[Realtime] Change stream error:', err.message)
        teardown()
        scheduleRetry()
      })

      bus.stream = stream
      bus.retryDelay = 1000
      console.log('[Realtime] Change stream open')
    } catch (err: any) {
      console.error('[Realtime] Failed to open change stream:', err.message)
      scheduleRetry()
    } finally {
      bus.starting = null
    }
  })()

  await bus.starting
}

/** Register an SSE connection for one user; returns its unsubscribe function. */
export function subscribe(userId: string, send: (signal: ChangeSignal) => void, isAdmin = false): () => void {
  const sub: Subscriber = { userId, projectIds: new Set(), isAdmin, send }
  bus.subscribers.add(sub)

  // Start with the projects the user belongs to now; project signals keep
  // the set current afterwards. Signals arriving before this resolves are
  // harmless — the client does its own initial fetch.
  Project.find({ $or: [{ owner: userId }, { members: userId }] })
    .select('_id')
    .lean()
    .then((projects) => {
      for (const p of projects) sub.projectIds.add(str((p as any)._id))
    })
    .catch((err) => console.error('[Realtime] Failed to load memberships:', err.message))

  void ensureStream()

  return () => {
    bus.subscribers.delete(sub)
    // Last client gone: release the stream so an idle server holds no
    // change-stream slot on the cluster.
    if (bus.subscribers.size === 0) {
      teardown()
    }
  }
}
