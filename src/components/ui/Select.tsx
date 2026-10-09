'use client'

import React from 'react'
import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

/**
 * A native select (so phones show their own picker) styled like Input. The
 * browser's arrow is drawn right at the edge and cannot be moved, so it is
 * replaced with one that has proper room: the select reserves space for it on
 * the right and the arrow ignores taps (they go to the select underneath).
 * Pass `<option>`s as children.
 */
export function Select({ label, className, id, children, ...props }: SelectProps) {
  const selectId = id ?? props.name

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={clsx(
            'h-11 w-full appearance-none rounded-xl border border-hairline bg-surface pl-3.5 pr-11 text-sm text-ink',
            'transition-all focus:border-focus focus:outline-none focus:ring-4 focus:ring-focus/12',
            'disabled:cursor-not-allowed disabled:opacity-60',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      </div>
    </div>
  )
}
