'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { LayoutGrid, KanbanSquare, BarChart3, Users, Settings } from 'lucide-react'

interface ProjectTabsProps {
  projectId: string
}

export function ProjectTabs({ projectId }: ProjectTabsProps) {
  const pathname = usePathname()
  const base = `/dashboard/projects/${projectId}`

  const tabs = [
    { href: base, label: 'Overview', icon: LayoutGrid, exact: true },
    { href: `${base}/kanban`, label: 'Board', icon: KanbanSquare },
    { href: `${base}/analytics`, label: 'Analytics', icon: BarChart3 },
    { href: `${base}/members`, label: 'Members', icon: Users },
    { href: `${base}/settings`, label: 'Settings', icon: Settings },
  ]

  return (
    <nav className="mt-5 flex gap-1 border-b border-hairline">
      {tabs.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)

        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              'relative flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium',
              'transition-colors duration-200',
              active ? 'text-brand-700' : 'text-ink-muted hover:text-ink'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
            {active && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-600" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
