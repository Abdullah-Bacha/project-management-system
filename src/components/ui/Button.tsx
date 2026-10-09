'use client'

import React from 'react'
import clsx from 'clsx'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:
    'bg-interactive text-on-brand shadow-sm hover:bg-interactive-hover hover:shadow-lifted active:scale-[0.98]',
  secondary:
    'bg-surface text-ink border border-hairline hover:border-brand-300 hover:bg-brand-50/50 active:scale-[0.98]',
  ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-critical text-on-brand shadow-sm hover:brightness-95 active:scale-[0.98]',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
}

/** The Button look, for anything that is not a <button> (see ButtonLink). */
export function buttonStyles({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  className?: string
} = {}) {
  return clsx(
    'inline-flex items-center justify-center rounded-xl font-medium',
    'transition-all duration-200 ease-out',
    'disabled:pointer-events-none disabled:opacity-55',
    variants[variant],
    sizes[size],
    fullWidth && 'w-full',
    className
  )
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
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
  return (
    <button
      disabled={disabled || isLoading}
      className={buttonStyles({ variant, size, fullWidth, className })}
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
