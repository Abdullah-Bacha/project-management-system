'use client'

import { useEffect, useState } from 'react'
import { RealtimeStatus } from '@/components/ui/RealtimeStatus'
import { greetingFor } from '@/lib/format'
import type { User } from '@/types'
import { QuickActions } from './QuickActions'

interface DashboardHeaderProps {
  user: User | null
  lastUpdated: Date | null
  isLoading: boolean
  isLive: boolean
}

/** Greeting, a one-line summary of the page, role-aware shortcuts and the live-connection status. */
export function DashboardHeader({ user, lastUpdated, isLoading, isLive }: DashboardHeaderProps) {
  // The server cannot know the visitor's local time, so the greeting is filled
  // in after mount instead of risking a hydration mismatch.
  const [greeting, setGreeting] = useState('Welcome back')
  useEffect(() => setGreeting(greetingFor(new Date().getHours())), [])

  const firstName = user?.name?.split(' ')[0]

  return (
    <header className="animate-rise flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight text-ink">
          {greeting}
          {firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Keydevs Project Management System
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <QuickActions role={user?.role} />
        <RealtimeStatus lastUpdated={lastUpdated} isLoading={isLoading} isConnected={isLive} />
      </div>
    </header>
  )
}
