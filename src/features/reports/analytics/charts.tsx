'use client'

import clsx from 'clsx'

/**
 * Small dependency-free charts for the Reports page. Colours are the design
 * tokens (via Tailwind `text-*` / `bg-*` utilities), never raw hex values, and
 * every chart has a text equivalent (legend with counts, or a screen-reader
 * table) so meaning never depends on colour alone.
 */

export interface Slice {
  key: string
  label: string
  value: number
  /** A `text-*` token class used as the segment colour, e.g. `text-positive`. */
  color: string
  /** The matching `bg-*` class for legend swatches and bars. */
  swatch: string
}

const pct = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0)

/** Doughnut with the total in the middle and a legend that carries every number. */
export function DonutChart({ slices, label, centerLabel = 'tasks' }: { slices: Slice[]; label: string; centerLabel?: string }) {
  const total = slices.reduce((n, s) => n + s.value, 0)
  const R = 40
  const C = 2 * Math.PI * R
  let offset = 0

  return (
    <div className="@container">
    <div className="flex flex-col items-center gap-5 @md:flex-row">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${label}: ${slices.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="12" className="stroke-surface-sunken" />
          {total > 0 &&
            slices
              .filter((s) => s.value > 0)
              .map((s) => {
                const length = (s.value / total) * C
                const el = (
                  <circle
                    key={s.key}
                    cx="50"
                    cy="50"
                    r={R}
                    fill="none"
                    strokeWidth="12"
                    stroke="currentColor"
                    className={s.color}
                    strokeDasharray={`${length} ${C - length}`}
                    strokeDashoffset={-offset}
                  />
                )
                offset += length
                return el
              })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-ink">{total}</span>
          <span className="text-xs text-ink-muted">{centerLabel}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {slices.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-ink-soft">
              <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', s.swatch)} aria-hidden />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums text-ink">
              <span className="font-medium">{s.value}</span>
              <span className="ml-1.5 text-xs text-ink-muted">{pct(s.value, total)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
    </div>
  )
}

export interface BarRow {
  key: string
  label: string
  value: number
  swatch: string
  href?: string
}

/** Horizontal bars scaled to the largest row; the number is always printed. */
export function BarList({ rows, label, unit = 'tasks' }: { rows: BarRow[]; label: string; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-3" aria-label={label}>
      {rows.map((r) => (
        <li key={r.key}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-soft">{r.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-ink">{r.value}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-label={`${r.label}: ${r.value} ${unit}`}
            aria-valuenow={r.value}
            aria-valuemin={0}
            aria-valuemax={max}
          >
            <div className={clsx('h-full rounded-full transition-all duration-300', r.swatch)} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export interface Series {
  key: 'created' | 'completed'
  label: string
  color: string
  swatch: string
}

export interface TrendDatum {
  start: string
  created: number
  completed: number
}

const fmtDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/** Line chart over time. Axis labels, a legend, and a screen-reader table carry the data. */
export function TrendChart({ points, series, granularity, label, timeZone }: { points: TrendDatum[]; series: Series[]; granularity: 'day' | 'week'; label: string; timeZone: string }) {
  const W = 600
  const H = 220
  const pad = { l: 34, r: 12, t: 12, b: 26 }
  const max = Math.max(1, ...points.flatMap((p) => series.map((s) => p[s.key])))
  // A "nice" top for the y axis so the ticks are whole numbers.
  const top = max <= 4 ? max : Math.ceil(max / 4) * 4
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, top / 4, top / 2, (top * 3) / 4, top]

  const x = (i: number) => pad.l + (points.length <= 1 ? (W - pad.l - pad.r) / 2 : (i / (points.length - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b)

  const labelEvery = Math.max(1, Math.ceil(points.length / 6))

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-ink-soft">
            <span className={clsx('h-2.5 w-2.5 rounded-full', s.swatch)} aria-hidden />
            {s.label}
            <span className="font-medium tabular-nums text-ink">{points.reduce((n, p) => n + p[s.key], 0)}</span>
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-hairline" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-ink-muted" fontSize="10">
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.start} x={x(i)} y={H - 8} textAnchor="middle" className="fill-ink-muted" fontSize="10">
              {fmtDay(p.start)}
            </text>
          ) : null
        )}
        {series.map((s) => (
          <g key={s.key} className={s.color}>
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              points={points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(' ')}
            />
            {points.length <= 31 &&
              points.map((p, i) => (p[s.key] > 0 ? <circle key={p.start} cx={x(i)} cy={y(p[s.key])} r="2.5" fill="currentColor" /> : null))}
          </g>
        ))}
      </svg>

      <p className="mt-1 text-xs text-ink-muted">
        {granularity === 'week' ? 'Each point is one week (Monday–Sunday)' : 'Each point is one day'}, in your time zone ({timeZone}).
      </p>

      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{granularity === 'week' ? 'Week starting' : 'Day'}</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.start}>
              <th scope="row">{p.start}</th>
              {series.map((s) => (
                <td key={s.key}>{p[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
