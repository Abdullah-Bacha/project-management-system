# Real-Time Updates — How It Works

The dashboard updates **when data actually changes**, not on a timer. There is
no interval polling in the normal path: an idle dashboard makes **zero** API
requests.

---

## The mechanism

```
MongoDB change stream  →  /api/events (SSE)  →  browser  →  refetch that one endpoint
```

1. **`src/lib/realtime/bus.ts`** — opens **one** MongoDB change stream for the
   whole server process and fans it out to every connected client. It starts
   with the first client and closes when the last one leaves, so an idle
   server holds no change-stream slot on the cluster.

2. **`src/app/api/events/route.ts`** — a Server-Sent Events endpoint. Each
   client holds this response open and receives one small frame per change:

   ```
   data: {"collection":"projects","op":"update"}
   ```

   Only the **collection name** is sent — never document data. Clients refetch
   through the normal authenticated APIs, so per-user authorization is
   unchanged and no one can see data they aren't entitled to.

3. **`src/lib/realtime/events-client.ts`** — one shared connection per browser
   tab, fanned out to every hook. Uses `fetch` streaming rather than
   `EventSource` so the Bearer token travels in a header instead of the URL.

4. **`src/hooks/useRealtimeData.ts`** — fetches once on mount, then refetches
   only when a watched collection signals a change. Bursts within 250ms
   coalesce into a single request.

---

## Using it

### Projects

```tsx
const { projects, isLoading, error, lastUpdated, isLive } = useRealtimeProjects()
```

Refetches when `projects`, `tasks`, or `teams` change (tasks and teams feed
project progress and membership).

### Tasks

```tsx
const { tasks, updateTaskStatus, isLive } = useRealtimeTasks(projectId)
```

Refetches when `tasks` or `comments` change. Without a `projectId` it stays
idle — there is no list-all-tasks endpoint.

### Notifications

```tsx
const { notifications, unreadCount, markAsRead, isLive } = useRealtimeNotifications()
```

### Derived data (no fetch of its own)

For values computed from several endpoints — e.g. the dashboard's analytics
cards — subscribe to the signal directly:

```tsx
const [version, setVersion] = useState(0)
useRealtimeSignal(['tasks'], () => setVersion((v) => v + 1))

useEffect(() => { /* recompute */ }, [version])
```

### A custom endpoint

```tsx
const { data, isLive } = useRealtimeData({
  endpoint: '/api/admin/reports',
  watch: ['reports'],
})
```

`watch` takes **MongoDB collection names** (lowercase plural, as Mongoose
creates them): `projects`, `tasks`, `users`, `teams`, `comments`,
`notifications`, `reports`.

---

## What each hook returns

| Field | Meaning |
|---|---|
| `isLoading` | true only until the first response |
| `error` | last request error, or a session-expired message |
| `lastUpdated` | timestamp of the last **actual** data change |
| `isLive` | whether the push channel is connected |
| `refetch()` | manual refresh (respects the enabled/auth gates) |

`RealtimeStatus` shows a green **Live** badge when `isLive && !error`, and
**Offline** otherwise — so a dropped connection is visible instead of silently
showing stale data as current.

---

## Resilience

- **Connection drops** → the client reconnects with exponential backoff
  (1s → 30s cap) and refetches once on reconnect to catch up on anything
  missed while disconnected.
- **While disconnected** → falls back to slow 30-second polling so the page
  still converges. This stops the moment the push channel is back.
- **Token expires** → the request goes through the shared axios client, which
  transparently refreshes the token and replays. The SSE connection
  re-authenticates the same way.
- **Session ends** → a 401 that survives the refresh stops all activity
  instead of retrying forever.
- **Out-of-order responses** → a request-generation guard means a slow
  response can never overwrite newer data.

---

## Deployment

**Requires MongoDB replica set or Atlas.** Change streams do not work on a
standalone `mongod`. Atlas (any tier, including free) works — the connection
string already includes `replicaSet=...`.

**Best on a persistent Node host** (Railway, Render, Fly, a VPS, Docker,
`next start`). The SSE connection and the change stream both stay open for the
life of the process.

**On serverless (Vercel, Netlify Functions)** the SSE response is cut at the
platform's function-duration limit. `maxDuration = 300` is set on the route,
but the effective ceiling is whatever your plan allows. The client reconnects
automatically, so it still works — you just pay one reconnect per limit
window instead of a truly persistent connection. It remains far cheaper than
5-second polling. If you deploy to Vercel and want a genuinely persistent
channel, put the events endpoint on a small always-on service, or use a hosted
pub/sub (Pusher, Ably, Supabase Realtime) in place of `bus.ts`.

---

## Files

```
src/lib/realtime/bus.ts             MongoDB change stream → subscriber fan-out
src/lib/realtime/events-client.ts   One shared SSE connection per tab
src/app/api/events/route.ts         SSE endpoint (authenticated)
src/hooks/useRealtimeData.ts        useRealtimeData + Projects/Tasks/Notifications/Signal
src/components/ui/RealtimeStatus.tsx  Live / Offline badge
```

---

## Troubleshooting

**Badge stuck on "Offline"** — the SSE connection is failing. Check the browser
Network tab for `/api/events`: a 401 means the token is bad; a connection error
means the server is down. Check the server log for
`[Realtime] Change stream open`.

**Nothing updates on change** — confirm the collection name in `watch` matches
what MongoDB actually uses (lowercase plural). Confirm the server log shows the
change stream opened; if it logged an error, the database is likely not a
replica set.

**Updates arrive but data looks stale** — the endpoint being refetched may not
reflect that collection. Check that `watch` lists every collection whose change
affects the response.
