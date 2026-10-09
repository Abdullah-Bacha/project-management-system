'use client'

import { useEffect } from 'react'
import { ErrorState } from '@/components/ui/PageState'

/** Last-resort boundary for pages outside the dashboard (sign-in, reset password…). */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('App error:', error)
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken p-4">
      <ErrorState message="Something went wrong loading this page." onRetry={reset} />
    </div>
  )
}
