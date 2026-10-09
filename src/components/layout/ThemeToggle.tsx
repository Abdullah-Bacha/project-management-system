'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

/**
 * Light / dark switch. The page's theme is the `data-theme` attribute on <html>
 * (set before first paint by the script in the root layout, so there is no
 * flash); the colours themselves are the design tokens in globals.css.
 * The choice is remembered in localStorage.
 */
export function ThemeToggle() {
  // Unknown until mounted: the server cannot know the visitor's theme, and
  // guessing would cause a hydration mismatch.
  const [theme, setTheme] = useState<Theme | null>(null)

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setTheme(next)
    try {
      localStorage.setItem('theme', next)
    } catch {
      // Private mode / blocked storage: the theme still changes for this visit.
    }
  }

  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <button
      onClick={toggle}
      disabled={theme === null}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink"
    >
      {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
    </button>
  )
}
