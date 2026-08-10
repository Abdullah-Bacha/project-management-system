# TaskFlow Dashboard - Real-Time Updates & Demo Account Setup

## 🎯 New Features

This update adds:
1. **Demo Admin Account** - Quick testing with preset credentials
2. **Real-Time Dashboard Updates** - Live polling for tasks, projects, and notifications
3. **Real-Time Status Indicator** - Visual indicator showing when data was last updated

---

## 📋 Quick Start

### 1. Create Demo Admin Account

#### Option A: Using the existing seed script (RECOMMENDED)

```bash
npm run seed
```

This creates the following demo account along with sample data:
- **Email:** `testing@gmail.com`
- **Password:** `testing@123`
- **Role:** Admin

#### Option B: Using the standalone seed script

If you want to add the demo account without resetting your database:

```bash
node scripts/seed-demo-account.js
```

**Note:** Make sure your `.env.local` file is configured with `MONGODB_URI`.

### 2. Login with Demo Account

1. Go to the login page
2. You'll see a blue box showing demo credentials at the top
3. Click "Fill in demo credentials" or manually enter:
   - Email: `testing@gmail.com`
   - Password: `testing@123`
4. Click "Sign in"

---

## 🔄 Real-Time Features

### How Real-Time Works

The dashboard now uses **polling-based real-time updates** instead of WebSockets (better for Next.js serverless):

- **Projects & Tasks:** Updated every 4-5 seconds
- **Notifications:** Updated every 3 seconds
- **Live Status Indicator:** Shows when data was last refreshed

### Using Real-Time Hooks in Your Components

#### useRealtimeProjects()

```tsx
import { useRealtimeProjects } from '@/hooks/useRealtimeData'

export function MyProjectList() {
  const { projects, isLoading, refetch } = useRealtimeProjects()

  return (
    <div>
      {projects.map((project) => (
        <div key={project._id}>{project.title}</div>
      ))}
      <button onClick={refetch}>Refresh Now</button>
    </div>
  )
}
```

#### useRealtimeTasks(projectId?)

```tsx
import { useRealtimeTasks } from '@/hooks/useRealtimeData'

export function MyTasks() {
  const { tasks, isLoading, updateTaskStatus, refetch } = useRealtimeTasks('projectId')

  const handleStatusChange = async (taskId, newStatus) => {
    await updateTaskStatus(taskId, newStatus)
  }

  return (
    <div>
      {tasks.map((task) => (
        <div key={task._id}>
          <h3>{task.title}</h3>
          <select onChange={(e) => handleStatusChange(task._id, e.target.value)}>
            <option value="todo">To Do</option>
            <option value="in-progress">In Progress</option>
            <option value="review">Review</option>
            <option value="complete">Complete</option>
          </select>
        </div>
      ))}
    </div>
  )
}
```

#### useRealtimeNotifications()

```tsx
import { useRealtimeNotifications } from '@/hooks/useRealtimeData'

export function NotificationCenter() {
  const { notifications, unreadCount, isLoading, markAsRead, refetch } =
    useRealtimeNotifications()

  return (
    <div>
      <h2>Notifications ({unreadCount} unread)</h2>
      {notifications.map((notif) => (
        <div key={notif._id}>
          <p>{notif.message}</p>
          <button onClick={() => markAsRead(notif._id)}>Mark as read</button>
        </div>
      ))}
    </div>
  )
}
```

#### useRealtimeData() - Generic Hook

Use this for custom endpoints:

```tsx
import { useRealtimeData } from '@/hooks/useRealtimeData'

export function CustomData() {
  const { data, isLoading, error, refetch } = useRealtimeData({
    endpoint: '/api/custom-endpoint',
    interval: 5000, // Poll every 5 seconds
    onUpdate: (data) => {
      console.log('Data updated:', data)
    },
  })

  return (
    <div>
      {isLoading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  )
}
```

### Real-Time Status Indicator

Add a real-time status badge to your components:

```tsx
import { RealtimeStatus } from '@/components/ui/RealtimeStatus'

export function MyComponent() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  return (
    <div>
      <RealtimeStatus lastUpdated={lastUpdated} isLoading={isLoading} />
      {/* Your content */}
    </div>
  )
}
```

The status indicator shows:
- 🟢 **Live** - Data is current
- 🟡 **Offline** - Connection issues
- **Time ago** - When data was last updated (e.g., "5m ago", "just now")

---

## 🔧 Configuration

### Polling Intervals

Default polling intervals in `src/hooks/useRealtimeData.ts`:

- **Projects:** 5000ms (5 seconds)
- **Tasks:** 4000ms (4 seconds)
- **Notifications:** 3000ms (3 seconds)

To customize, pass the `interval` option:

```tsx
const { data } = useRealtimeData({
  endpoint: '/api/projects',
  interval: 2000, // 2 seconds
})
```

### Disabling Real-Time Updates

```tsx
const { data } = useRealtimeData({
  endpoint: '/api/projects',
  enabled: false, // Polling disabled
})

// Re-enable manually
const handleRefresh = () => {
  // Manual refetch
  refetch()
}
```

---

## 📁 Project Structure

### New Files Added

```
src/
├── hooks/
│   └── useRealtimeData.ts          # Real-time hooks (projects, tasks, notifications)
├── lib/
│   └── realtime/
│       └── socket.ts               # WebSocket client (for future use)
├── components/
│   └── ui/
│       └── RealtimeStatus.tsx       # Status indicator component
├── app/
│   └── api/
│       └── ws/
│           └── route.ts            # WebSocket endpoint (placeholder)
└── scripts/
    └── seed-demo-account.js        # Standalone seed script

Updated Files:
├── src/components/auth/LoginForm.tsx    # Added demo credentials display
├── src/app/dashboard/page.tsx           # Added real-time project updates
└── src/lib/db/seed.ts                   # Added demo account creation
```

---

## 🚀 Next Steps & Improvements

### Current Implementation (Polling)

✅ Works with Next.js serverless  
✅ Simple to implement  
✅ No additional dependencies  
✅ Supports manual and automatic refreshes  

### Future Enhancements (Optional)

1. **WebSocket Support** - Use a custom Node.js server or Socket.io for true real-time
2. **Server-Sent Events (SSE)** - Browser streaming API as WebSocket alternative
3. **Optimistic Updates** - Update UI immediately, sync with server
4. **Incremental Updates** - Only fetch changed data instead of full re-fetch
5. **Background Sync** - Sync data when app regains connection

---

## 🐛 Troubleshooting

### Demo Account Not Created?

1. Check that `.env.local` has `MONGODB_URI` configured
2. Verify MongoDB connection is working
3. Check console for error messages
4. Try running the seed script again

### Real-Time Data Not Updating?

1. Check browser console for errors
2. Verify API endpoints are responding (check Network tab)
3. Check that user is authenticated (token in localStorage)
4. Try manual refetch to verify data loads at all

### "Authorization" Header Errors?

Make sure your API routes are checking the token correctly:

```tsx
const token = request.headers.get('authorization')?.replace('Bearer ', '')
```

---

## 📚 API Endpoints Expected

The following endpoints should exist and support real-time updates:

- `GET /api/projects` - List all projects
- `GET /api/projects/:id/tasks` - List tasks in a project
- `GET /api/tasks` - List all tasks
- `PATCH /api/tasks/:id/status` - Update task status
- `GET /api/notifications` - List notifications
- `PATCH /api/notifications/:id/read` - Mark notification as read

All endpoints should accept `Authorization: Bearer <token>` header.

---

## 💡 Tips

1. **For Development:** Reduce polling intervals to see updates faster
2. **For Production:** Use longer intervals (10-30 seconds) to reduce server load
3. **For Performance:** Use conditional polling - disable when user is not active
4. **For Testing:** Use the demo account to test workflows without creating actual users

---

## Questions?

Check:
- `/src/hooks/useRealtimeData.ts` - Hook implementations
- `/src/components/ui/RealtimeStatus.tsx` - Status component
- `/src/app/dashboard/page.tsx` - Dashboard integration example

Happy coding! 🚀
