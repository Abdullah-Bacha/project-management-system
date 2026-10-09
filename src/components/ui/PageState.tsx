'use client'

import React from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, SearchX, ShieldAlert } from 'lucide-react'
import { Button } from './Button'

/** Placeholder blocks shown while a page's first request is in flight. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-7xl space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-64 rounded-lg" />
      <div className="skeleton h-10 w-full max-w-md rounded-lg" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28 rounded-card" />
        ))}
      </div>
    </div>
  )
}

interface ErrorStateProps {
  /** The message to show; a 404/403 status picks friendlier wording. */
  message?: string | null
  status?: number | null
  onRetry?: () => void
  /** Tighter spacing, for a widget inside a page rather than a whole page. */
  compact?: boolean
  /** Where "Back" goes. Defaults to the dashboard for a whole-page 404/403; pass `false` for none. */
  back?: { href: string; label: string } | false
}

/** What a page shows when its request FAILED — never a skeleton. */
export function ErrorState({ message, status, onRetry, compact, back }: ErrorStateProps) {
  const notFound = status === 404
  const forbidden = status === 403
  // A whole page that cannot be shown always offers a way out.
  const backTarget = back === false ? null : (back ?? (!compact && (notFound || forbidden) ? { href: '/dashboard', label: 'Back to dashboard' } : null))
  const Icon = notFound ? SearchX : forbidden ? ShieldAlert : AlertTriangle

  const title = notFound
    ? 'Not found'
    : forbidden
      ? 'No access'
      : 'Something went wrong'
  const body = notFound
    ? 'This page does not exist, or you do not have access to it.'
    : forbidden
      ? 'You do not have permission to view this.'
      : message || 'We could not load this. Please try again.'

  return (
    <div role="alert" className={`mx-auto max-w-md text-center ${compact ? 'py-8' : 'py-16'}`}>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-critical-subtle text-critical">
        <Icon className="h-5 w-5" />
      </span>
      <h1 className="mt-4 text-lg font-semibold text-ink">{title}</h1>
      <p className="mt-1 text-sm text-ink-muted">{body}</p>
      {onRetry && !notFound && !forbidden && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
      {backTarget && (
        <div className="mt-4">
          <Link href={backTarget.href} className="inline-flex items-center gap-1.5 text-sm font-medium text-interactive hover:text-interactive-hover">
            <ArrowLeft className="h-3.5 w-3.5" />
            {backTarget.label}
          </Link>
        </div>
      )}
    </div>
  )
}

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  children?: React.ReactNode
  action?: React.ReactNode
  compact?: boolean
}

/** A request that succeeded but returned nothing. */
export function EmptyState({ icon, title, children, action, compact }: EmptyStateProps) {
  return (
    <div
      className={`animate-rise rounded-card border border-dashed border-hairline bg-surface text-center ${compact ? 'p-8' : 'p-12'}`}
    >
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
        {icon}
      </span>
      <h3 className="mt-4 font-medium text-ink">{title}</h3>
      {children && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
