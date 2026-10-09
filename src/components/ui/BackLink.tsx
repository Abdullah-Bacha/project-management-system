import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

/** "← Back to …": the one look for a way up to the parent page. */
export function BackLink({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink ${className}`}
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {children}
    </Link>
  )
}
