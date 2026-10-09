'use client'

import clsx from 'clsx'

type Tone = 'brand' | 'positive' | 'caution' | 'critical'

interface StatsCardProps {
  label: string
  value: number | string
  icon?: React.ReactNode
  /** Short supporting line under the value, e.g. "3 active". */
  hint?: string
  tone?: Tone
  /** Seconds of entrance delay, for staggering a row of cards. */
  delay?: number
  /** Makes the whole card a button (keyboard and screen-reader friendly). */
  onClick?: () => void
}

const tones: Record<Tone, { chip: string; glow: string }> = {
  brand: { chip: 'bg-brand-50 text-brand-700', glow: 'from-brand-500/8' },
  positive: { chip: 'bg-positive-subtle text-positive-strong', glow: 'from-positive/8' },
  caution: { chip: 'bg-caution-subtle text-caution-strong', glow: 'from-caution/8' },
  critical: { chip: 'bg-critical-subtle text-critical-strong', glow: 'from-critical/8' },
}

export function StatsCard({
  label,
  value,
  icon,
  hint,
  tone = 'brand',
  delay = 0,
  onClick,
}: StatsCardProps) {
  const { chip, glow } = tones[tone]

  const Root: React.ElementType = onClick ? 'button' : 'div'

  return (
    <Root
      {...(onClick && { type: 'button', onClick, 'aria-label': `${label}: ${value}. View details` })}
      className={clsx(
        onClick && 'w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-focus',
        'animate-rise group relative overflow-hidden rounded-card border border-hairline',
        'bg-surface p-4 shadow-card sm:p-5 transition-all duration-200 ease-out',
        'hover:-translate-y-0.5 hover:shadow-lifted'
      )}
      style={{ animationDelay: `${delay}s` }}
    >
      {/* Ambient wash that warms up on hover */}
      <div
        className={clsx(
          'pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent',
          'opacity-0 transition-opacity duration-300 group-hover:opacity-100',
          glow
        )}
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-muted">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-ink tabular-nums">
            {value}
          </p>

          {hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>}
        </div>

        {icon && (
          <span
            className={clsx(
              'hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex',
              'transition-transform duration-300 group-hover:scale-110',
              chip
            )}
          >
            {icon}
          </span>
        )}
      </div>
    </Root>
  )
}
