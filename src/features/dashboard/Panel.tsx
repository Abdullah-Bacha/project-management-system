import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

interface PanelProps {
  title: string
  /** Optional "view all" style link in the header. */
  action?: { href: string; label: string }
  className?: string
  children: React.ReactNode
}

/** The titled card the dashboard's side widgets sit in. */
export function Panel({ title, action, className, children }: PanelProps) {
  return (
    <section className={`rounded-card border border-hairline bg-surface shadow-card ${className ?? ''}`}>
      <header className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action && (
          <Link
            href={action.href}
            className="inline-flex items-center gap-1 text-xs font-medium text-interactive transition-colors hover:text-interactive-hover"
          >
            {action.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  )
}
