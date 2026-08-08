'use client'

import clsx from 'clsx'
import { TrendingUp, TrendingDown } from 'lucide-react'

type Tone = 'brand' | 'positive' | 'caution' | 'critical'

interface StatsCardProps {
  label: string
  value: number | string
  icon?: React.ReactNode
  trend?: number
  tone?: Tone
  /** Seconds of entrance delay, for staggering a row of cards. */
  delay?: number
}

const tones: Record<Tone, { chip: string; glow: string }> = {
  brand: { chip: 'bg-brand-50 text-brand-600', glow: 'from-brand-500/8' },
  positive: { chip: 'bg-positive/10 text-positive', glow: 'from-positive/8' },
  caution: { chip: 'bg-caution/10 text-caution', glow: 'from-caution/8' },
  critical: { chip: 'bg-critical/10 text-critical', glow: 'from-critical/8' },
}

export function StatsCard({
  label,
  value,
  icon,
  trend,
  tone = 'brand',
  delay = 0,
}: StatsCardProps) {
  const { chip, glow } = tones[tone]

  return (
    <div
      className={clsx(
        'animate-rise group relative overflow-hidden rounded-card border border-hairline',
        'bg-surface p-5 shadow-card transition-all duration-300 ease-out',
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

          {trend !== undefined && (
            <p
              className={clsx(
                'mt-2 inline-flex items-center gap-1 text-xs font-medium',
                trend >= 0 ? 'text-positive' : 'text-critical'
              )}
            >
              {trend >= 0 ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              {Math.abs(trend)}% vs last month
            </p>
          )}
        </div>

        {icon && (
          <span
            className={clsx(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
              'transition-transform duration-300 group-hover:scale-110',
              chip
            )}
          >
            {icon}
          </span>
        )}
      </div>
    </div>
  )
}
