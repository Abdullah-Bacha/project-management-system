'use client'

import React from 'react'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  icon,
  children,
  disabled,
  className,
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      'bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-lifted active:scale-[0.98]',
    secondary:
      'bg-surface text-ink border border-hairline hover:border-brand-300 hover:bg-brand-50/50 active:scale-[0.98]',
    ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
    danger: 'bg-critical text-white shadow-sm hover:brightness-95 active:scale-[0.98]',
  }

  const sizes = {
    sm: 'h-9 px-3.5 text-sm gap-1.5',
    md: 'h-11 px-5 text-sm gap-2',
    lg: 'h-12 px-6 text-base gap-2',
  }

  return (
    <button
      disabled={disabled || isLoading}
      className={clsx(
        'inline-flex items-center justify-center rounded-xl font-medium',
        'transition-all duration-200 ease-out',
        'disabled:pointer-events-none disabled:opacity-55',
        variants[variant],
        sizes[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Please wait</span>
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  )
}
