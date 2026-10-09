'use client'

import { ErrorState, PageSkeleton } from '@/components/ui/PageState'
import { useAuthStore } from '@/store/authStore'

/**
 * For pages that administrators and team leaders share (Reports). A developer
 * sees only "No access". As with AdminOnly this is a display courtesy: the APIs
 * behind these pages refuse developers on the server regardless.
 */
export function ManagerOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)

  if (!user) return <PageSkeleton />
  if (user.role !== 'admin' && user.role !== 'team_leader') return <ErrorState status={403} />
  return <>{children}</>
}
