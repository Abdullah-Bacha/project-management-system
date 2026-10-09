'use client'

import { ErrorState, PageSkeleton } from '@/components/ui/PageState'
import { useAuthStore } from '@/store/authStore'

/**
 * Keeps an admin page's header and controls off screen for anyone else, so a
 * developer sees only "No access". This is a display courtesy: the admin APIs
 * refuse non-admins on the server regardless.
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((state) => state.user)

  if (!user) return <PageSkeleton />
  if (user.role !== 'admin') return <ErrorState status={403} />
  return <>{children}</>
}
