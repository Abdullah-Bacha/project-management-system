'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { UserRole } from '@/types'
import { navFor, isActive, NOTIFICATIONS_HREF, type NavItem } from './navigation'

interface SidebarProps {
  role?: UserRole
  unreadCount: number
}

/**
 * The KeyDevs logo (public/keydevs.jpeg: black artwork on an off-white
 * background). Full logo when the sidebar is wide; on the narrow rail only the
 * KD mark is shown, cropped from the same file. Blend modes make the image's
 * background disappear on both themes — in dark mode the artwork is inverted.
 */
function BrandLogo() {
  const artwork = 'mix-blend-multiply brightness-[1.04] dark:mix-blend-screen dark:invert'
  return (
    <>
      <Image
        src="/keydevs.jpeg"
        alt="KeyDevs Technologies"
        width={867}
        height={317}
        priority
        className={`sb-logo-full h-12 w-auto ${artwork}`}
      />
      {/* Rail: a 34px-wide window onto the KD mark (x 338–520, y 8–135 of the 867×317 image). */}
      <span aria-hidden className="sb-logo-mark relative h-8 w-9 overflow-hidden">
        <Image
          src="/keydevs.jpeg"
          alt=""
          width={867}
          height={317}
          className={`absolute max-w-none ${artwork}`}
          style={{ width: 162, height: 59, left: -63, top: 3 }}
        />
      </span>
    </>
  )
}

/** A tooltip pinned beside an icon, for when the label is not on screen. */
type Tip = { label: string; top: number; left: number } | null
type ShowTip = (label: string) => (event: React.SyntheticEvent<HTMLElement>) => void

/**
 * Navigation only. Below `lg` it is a 64px icon rail; from `lg` it is full
 * width, and a collapse button shrinks it to the same rail. The width and label
 * switching is CSS (see `.sb-*` in globals.css) keyed off `<html data-sidebar>`;
 * this component only flips that attribute, remembers the choice, and shows
 * tooltips whenever labels are hidden.
 */
export function Sidebar({ role, unreadCount }: SidebarProps) {
  const pathname = usePathname()
  const groups = navFor(role)

  const [collapsed, setCollapsed] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const [tip, setTip] = useState<Tip>(null)
  const compact = collapsed || narrow // labels are hidden → icons need tooltips

  useEffect(() => {
    setCollapsed(document.documentElement.dataset.sidebar === 'collapsed')
    const query = window.matchMedia('(max-width: 1023px)')
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  const toggle = () => {
    const next = !collapsed
    document.documentElement.dataset.sidebar = next ? 'collapsed' : 'expanded'
    setCollapsed(next)
    setTip(null)
    try {
      localStorage.setItem('sidebar', next ? 'collapsed' : 'expanded')
    } catch {
      // Blocked storage: it still collapses for this visit.
    }
  }

  const showTip: ShowTip = (label) => (event) => {
    if (!compact) return
    const rect = event.currentTarget.getBoundingClientRect()
    setTip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 })
  }
  const hideTip = () => setTip(null)

  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar'

  return (
    <aside
      aria-label="Sidebar"
      className="sb-aside flex shrink-0 flex-col border-r border-hairline bg-surface"
    >
      <div className="sb-brand flex h-16 shrink-0 items-center border-b border-hairline">
        <Link
          href="/dashboard"
          aria-label="KeyDevs Technologies — dashboard home"
          className="rounded-lg outline-offset-4"
        >
          <BrandLogo />
        </Link>
      </div>

      <nav aria-label="Main" className="sb-nav flex-1 overflow-y-auto">
        {groups.map((group, index) => (
          <div key={group.id} role="group" aria-label={group.label}>
            {index > 0 && <div aria-hidden className="sb-section-rule mx-2 my-3 h-px bg-hairline" />}
            <p
              className={clsx(
                'sb-section-label px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint',
                index === 0 ? 'pt-1' : 'pt-5'
              )}
            >
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink
                    item={item}
                    active={isActive(pathname, item)}
                    badge={item.href === NOTIFICATIONS_HREF ? unreadCount : 0}
                    showTip={showTip}
                    hideTip={hideTip}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-hairline p-2 lg:p-3">
        <button
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={toggleLabel}
          onMouseEnter={showTip(toggleLabel)}
          onMouseLeave={hideTip}
          onFocus={showTip(toggleLabel)}
          onBlur={hideTip}
          className={clsx(
            'sb-collapse sb-link w-full items-center rounded-xl py-2 text-sm font-medium text-ink-muted',
            'transition-colors duration-150 hover:bg-surface-sunken hover:text-ink'
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4.5 w-4.5 shrink-0" />
          ) : (
            <PanelLeftClose className="h-4.5 w-4.5 shrink-0" />
          )}
          <span className="sb-label">Collapse</span>
        </button>
      </div>

      {tip && (
        <span
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          className="animate-fade pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-surface shadow-lifted"
        >
          {tip.label}
        </span>
      )}
    </aside>
  )
}

function SidebarLink({
  item: { href, label, icon: Icon },
  active,
  badge,
  showTip,
  hideTip,
}: {
  item: NavItem
  active: boolean
  badge: number
  showTip: ShowTip
  hideTip: () => void
}) {
  const fullLabel = badge > 0 ? `${label} (${badge} unread)` : label

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      aria-label={badge > 0 ? fullLabel : undefined}
      onMouseEnter={showTip(fullLabel)}
      onMouseLeave={hideTip}
      onFocus={showTip(fullLabel)}
      onBlur={hideTip}
      className={clsx(
        'sb-link group relative flex items-center rounded-xl py-2.5 text-sm font-medium',
        'transition-colors duration-150',
        active
          ? 'bg-brand-50 text-brand-700'
          : 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-interactive"
        />
      )}
      <span className="relative shrink-0">
        <Icon
          className={clsx(
            'h-4.5 w-4.5 transition-transform duration-200',
            !active && 'group-hover:scale-110'
          )}
        />
        {/* Without room for a count, show a dot. */}
        {badge > 0 && (
          <span className="sb-badge-dot absolute -right-1 -top-1 h-2 w-2 rounded-full bg-critical ring-2 ring-surface" />
        )}
      </span>
      <span className="sb-label truncate">{label}</span>
      {badge > 0 && (
        <span className="sb-badge-pill ml-auto h-5 min-w-5 items-center justify-center rounded-full bg-critical px-1.5 text-[11px] font-semibold text-on-brand">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </Link>
  )
}
