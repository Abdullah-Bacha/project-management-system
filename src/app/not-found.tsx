import Link from 'next/link'
import { SearchX } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken p-4">
      <div className="max-w-md text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <SearchX className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">Page not found</h1>
        <p className="mt-1 text-sm text-ink-muted">
          The page you are looking for does not exist or has moved.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex text-sm font-medium text-interactive hover:text-interactive-hover"
        >
          Go to your dashboard
        </Link>
      </div>
    </div>
  )
}
