'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/PageState'

/** Catches an unexpected render error inside the dashboard and keeps the sidebar usable. */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard error:', error)
  }, [error])

  return <ErrorState message="This page hit an unexpected error." onRetry={reset} back={{ href: '/dashboard', label: 'Back to dashboard' }} />
}
