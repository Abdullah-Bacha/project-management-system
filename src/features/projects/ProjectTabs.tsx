'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { KanbanSquare, BarChart3, Settings } from 'lucide-react'

interface ProjectTabsProps {
  projectId: string
}

export function ProjectTabs({ projectId }: ProjectTabsProps) {
  const pathname = usePathname()
  const base = `/dashboard/projects/${projectId}`

  // Work is the project's home (its older /kanban address stays valid).
  const tabs = [
    { href: base, label: 'Work', icon: KanbanSquare, isActive: pathname === base || pathname.startsWith(`${base}/kanban`) },
    { href: `${base}/analytics`, label: 'Progress', icon: BarChart3, isActive: pathname.startsWith(`${base}/analytics`) },
    { href: `${base}/settings`, label: 'Settings', icon: Settings, isActive: pathname.startsWith(`${base}/settings`) },
  ]

  return (
    <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-hairline" aria-label="Project sections">
      {tabs.map(({ href, label, icon: Icon, isActive: active }) => {
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              'relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium sm:px-3.5',
              'transition-colors duration-200',
              active ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-interactive" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
