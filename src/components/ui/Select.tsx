'use client'

import React from 'react'
import clsx from 'clsx'

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
}

/** A native select styled like Input. Pass `<option>`s as children. */
export function Select({ label, className, id, children, ...props }: SelectProps) {
  const selectId = id ?? props.name

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="mb-1.5 block text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={clsx(
          'h-11 w-full rounded-xl border border-hairline bg-surface px-3 text-sm text-ink',
          'transition-all focus:border-focus focus:outline-none focus:ring-4 focus:ring-focus/12',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className
        )}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}
