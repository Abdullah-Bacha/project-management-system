'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'
import { api } from '@/services/client'
import { useUnreadCount } from '@/features/notifications/useNotifications'
import { usePresenceReporter } from '@/hooks/usePresenceReporter'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import type { User } from '@/types'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const token = useAuthStore((state) => state.token)
  const { user, logout } = useAuth()
  const unreadCount = useUnreadCount()

  // While this signed-in tab is open the person shows as online to the admin (see lib/presence).
  usePresenceReporter(Boolean(token))

  // Not signed in: back to the login page. (This is a convenience — every
  // API call is authorized by the server regardless of what the browser says.)
  useEffect(() => {
    useAuthStore.getState().hydrate()
    if (!useAuthStore.getState().token) {
      router.push('/auth/login')
    }
  }, [router])

  // The token and user in localStorage are only a cache — anyone can edit
  // them. Confirm the session with the server (which also ends it for a
  // suspended/removed account) and take the role from its answer.
  useEffect(() => {
    if (!token) return
    api
      .get<{ user: User }>('/api/auth/me')
      .then(({ data }) => {
        useAuthStore.getState().setUser(data.user)
        localStorage.setItem('user', JSON.stringify(data.user))
      })
      .catch(() => {})
  }, [token])

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-sunken">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-hairline border-t-interactive" />
          <p className="text-sm text-ink-muted">Loading your workspace…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-sunken">
      <Sidebar role={user?.role} unreadCount={unreadCount} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={user} unreadCount={unreadCount} onLogout={logout} />
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
