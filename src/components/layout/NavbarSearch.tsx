'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { AlertTriangle, FolderKanban, ListChecks, Loader2, Search, User as UserIcon, X } from 'lucide-react'
import { searchService } from '@/services/search.service'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDismiss } from '@/hooks/useDismiss'
import { ROLE_LABELS } from '@/lib/roles'
import type { SearchResults, UserRole } from '@/types'
import { navFor } from './navigation'

const MIN_QUERY = 2
const DEBOUNCE_MS = 250
const LISTBOX_ID = 'navbar-search-results'

interface ResultItem {
  key: string
  title: string
  subtitle?: string
  href: string
  icon: typeof Search
}
interface ResultGroup {
  label: string
  items: ResultItem[]
}

/** Where a person result goes. There is no per-user page: admins manage accounts, everyone else has their team. */
const peopleHref = (role?: UserRole) => (role === 'admin' ? '/dashboard/admin/users' : '/dashboard/team')

function toGroups(results: SearchResults, role?: UserRole): ResultGroup[] {
  return [
    {
      label: 'Projects',
      items: results.projects.map((p) => ({
        key: `project-${p._id}`,
        title: p.title,
        subtitle: p.status,
        href: `/dashboard/projects/${p._id}`,
        icon: FolderKanban,
      })),
    },
    {
      label: 'Tasks',
      items: results.tasks.map((t) => ({
        key: `task-${t._id}`,
        title: t.title,
        subtitle: `${t.project.title} · ${t.status.replace('-', ' ')}`,
        href: `/dashboard/projects/${t.project._id}?task=${t._id}`,
        icon: ListChecks,
      })),
    },
    {
      label: 'People',
      items: results.people.map((u) => ({
        key: `person-${u._id}`,
        title: u.name,
        subtitle: ROLE_LABELS[u.role] ?? u.role,
        href: peopleHref(role),
        icon: UserIcon,
      })),
    },
  ].filter((group) => group.items.length > 0)
}

/** Links to every page the user can open — shown before they type. */
function quickLinks(role?: UserRole): ResultGroup[] {
  const items = navFor(role)
    .flatMap((group) => group.items)
    .map((nav) => ({
      key: `nav-${nav.href}`,
      title: nav.label,
      href: nav.href,
      icon: nav.icon,
    }))
  return [{ label: 'Quick links', items }]
}

interface NavbarSearchProps {
  role?: UserRole
}

/**
 * Navbar search over the user's real data (projects, tasks and — where the
 * server allows — people). Opens with a click or Ctrl/⌘+K, searches after a
 * short pause in typing, and is fully keyboard driven. Below `md` it collapses
 * to an icon that opens a full-width bar.
 */
export function NavbarSearch({ role }: NavbarSearchProps) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [compactOpen, setCompactOpen] = useState(false) // the mobile full-width bar
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [active, setActive] = useState(0)
  const [shortcut, setShortcut] = useState('Ctrl K')

  const term = query.trim()
  const debounced = useDebouncedValue(term, DEBOUNCE_MS)
  const searching = term.length >= MIN_QUERY

  const close = useCallback(() => {
    setOpen(false)
    setCompactOpen(false)
  }, [])
  useDismiss(containerRef, open || compactOpen, close)

  // Show ⌘K on Apple devices.
  useEffect(() => {
    if (/Mac|iPhone|iPad/i.test(navigator.platform)) setShortcut('⌘K')
  }, [])

  // Ctrl/⌘+K focuses the search from anywhere.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (window.matchMedia('(min-width: 768px)').matches) inputRef.current?.focus()
        else setCompactOpen(true)
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // On small screens the input only exists once the bar is open.
  useEffect(() => {
    if (compactOpen) inputRef.current?.focus()
  }, [compactOpen])

  // Run the search for the settled term; a newer term cancels an older request.
  useEffect(() => {
    if (debounced.length < MIN_QUERY) {
      setResults(null)
      setLoading(false)
      setFailed(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    searchService
      .search(debounced, controller.signal)
      .then((data) => setResults(data))
      .catch((error) => {
        if (controller.signal.aborted || error?.code === 'ERR_CANCELED') return
        setResults(null)
        setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [debounced, attempt])

  const groups = useMemo(
    () => (searching ? (results ? toGroups(results, role) : []) : quickLinks(role)),
    [searching, results, role]
  )
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])

  useEffect(() => setActive(0), [flat.length, searching])

  const go = (item: ResultItem) => {
    close()
    setQuery('')
    inputRef.current?.blur()
    router.push(item.href)
  }

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!flat.length) return
      setOpen(true)
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + flat.length) % flat.length)
    } else if (event.key === 'Enter') {
      const item = flat[active]
      if (item) {
        event.preventDefault()
        go(item)
      }
    } else if (event.key === 'Escape') {
      close()
      inputRef.current?.blur()
    }
  }

  const showPanel = open
  const settling = searching && (term !== debounced || loading)
  const noResults = searching && !settling && !failed && results !== null && flat.length === 0

  let index = -1 // running option index across groups, for aria-activedescendant

  return (
    <>
      {!compactOpen && (
        <button
          onClick={() => {
            setCompactOpen(true)
            setOpen(true)
          }}
          aria-label="Search"
          title={`Search (${shortcut})`}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink md:hidden"
        >
          <Search className="h-4.5 w-4.5" />
        </button>
      )}

      <div
        ref={containerRef}
        className={clsx(
          compactOpen
            ? 'fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-2 border-b border-hairline bg-surface px-3 md:static md:z-auto md:block md:h-auto md:border-0 md:bg-transparent md:px-0'
            : 'hidden w-44 md:block lg:w-72 xl:w-80'
        )}
      >
        <div className="relative min-w-0 flex-1 md:w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onInputKeyDown}
            placeholder="Search projects, tasks, people…"
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-label="Search projects, tasks and people"
            aria-expanded={showPanel}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={showPanel && flat[active] ? `search-option-${active}` : undefined}
            className={clsx(
              'h-9 w-full rounded-lg border border-hairline bg-surface-sunken pl-9 pr-16 text-sm text-ink',
              'placeholder:text-ink-faint transition-colors duration-150',
              'focus:border-focus focus:bg-surface focus:outline-none focus:ring-4 focus:ring-focus/12',
              '[&::-webkit-search-cancel-button]:hidden'
            )}
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {settling ? (
              <Loader2 className="h-4 w-4 animate-spin text-ink-faint" aria-label="Searching" />
            ) : (
              !query && (
                <kbd className="hidden rounded border border-hairline bg-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-ink-faint lg:block">
                  {shortcut}
                </kbd>
              )
            )}
            {query && (
              <button
                onClick={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                aria-label="Clear search"
                className="rounded p-0.5 text-ink-faint transition-colors hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {showPanel && (
            <div className="animate-rise absolute left-0 right-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-hairline bg-surface p-1.5 shadow-lifted md:right-auto md:w-[22rem] md:max-w-[calc(100vw-6rem)]">
              {failed ? (
                <div role="alert" className="flex items-center gap-2.5 px-3 py-3 text-sm text-ink-muted">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-caution" />
                  <span className="flex-1">Search is unavailable right now.</span>
                  <button
                    onClick={() => setAttempt((n) => n + 1)}
                    className="font-medium text-interactive hover:text-interactive-hover"
                  >
                    Retry
                  </button>
                </div>
              ) : noResults ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-sm font-medium text-ink">No results found</p>
                  <p className="mt-0.5 text-xs text-ink-muted">Try another search term.</p>
                </div>
              ) : settling && flat.length === 0 ? (
                <p className="px-3 py-4 text-sm text-ink-muted">Searching…</p>
              ) : (
                <div id={LISTBOX_ID} role="listbox" aria-label="Search results">
                  {term.length === 1 && (
                    <p className="px-3 pb-1 pt-2 text-xs text-ink-faint">
                      Type at least {MIN_QUERY} characters to search.
                    </p>
                  )}
                  {groups.map((group) => (
                    <div key={group.label} role="presentation" className="py-1">
                      <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                        {group.label}
                      </p>
                      {group.items.map((item) => {
                        index += 1
                        const position = index
                        const Icon = item.icon
                        return (
                          <div
                            key={item.key}
                            id={`search-option-${position}`}
                            role="option"
                            aria-selected={position === active}
                            onMouseEnter={() => setActive(position)}
                            onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                            onClick={() => go(item)}
                            className={clsx(
                              'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-100',
                              position === active ? 'bg-brand-50' : 'hover:bg-surface-sunken',
                              settling && 'opacity-60'
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0 text-ink-faint" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm text-ink">{item.title}</span>
                              {item.subtitle && (
                                <span className="block truncate text-xs capitalize text-ink-muted">
                                  {item.subtitle}
                                </span>
                              )}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {compactOpen && (
          <button
            onClick={close}
            aria-label="Close search"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink md:hidden"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        )}
      </div>
    </>
  )
}
