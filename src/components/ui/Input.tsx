'use client'

import React from 'react'
import clsx from 'clsx'
import { AlertCircle } from 'lucide-react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
  icon?: React.ReactNode
}

export function Input({
  label,
  error,
  helperText,
  icon,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? props.name

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-ink-soft"
        >
          {label}
        </label>
      )}

      <div className="relative">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          aria-invalid={!!error}
          className={clsx(
            'h-11 w-full rounded-xl border bg-surface text-sm text-ink',
            'placeholder:text-ink-faint',
            'transition-all duration-200 ease-out',
            'focus:outline-none focus:ring-4',
            icon ? 'pl-10 pr-4' : 'px-4',
            error
              ? 'border-critical focus:border-critical focus:ring-critical/12'
              : 'border-hairline focus:border-brand-500 focus:ring-brand-500/12',
            className
          )}
          {...props}
        />
      </div>

      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-sm text-critical">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : helperText ? (
        <p className="mt-1.5 text-sm text-ink-faint">{helperText}</p>
      ) : null}
    </div>
  )
}
