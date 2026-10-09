import clsx from 'clsx'

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-10 w-10 text-sm',
  xl: 'h-20 w-20 text-2xl',
} as const

interface AvatarProps {
  name?: string | null
  /** Profile picture URL; falls back to the initial when missing. */
  src?: string | null
  size?: keyof typeof sizes
  className?: string
}

/** The user's picture, or their initial on the brand gradient. */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        aria-hidden
        className={clsx('shrink-0 rounded-full object-cover', sizes[size], className)}
      />
    )
  }
  return (
    <span
      aria-hidden
      className={clsx(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-on-brand',
        'bg-gradient-to-br from-brand-500 to-accent',
        sizes[size],
        className
      )}
    >
      {name?.charAt(0).toUpperCase() || '?'}
    </span>
  )
}
