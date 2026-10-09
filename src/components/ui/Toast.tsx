'use client'

import React from 'react'
import clsx from 'clsx'
import { CheckCircle2, XCircle, Info, AlertTriangle, X } from 'lucide-react'

interface ToastProps {
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  onClose: () => void
  duration?: number
}

const variants = {
  success: { icon: CheckCircle2, tone: 'text-positive', ring: 'bg-positive' },
  error: { icon: XCircle, tone: 'text-critical', ring: 'bg-critical' },
  info: { icon: Info, tone: 'text-info', ring: 'bg-info' },
  warning: { icon: AlertTriangle, tone: 'text-caution', ring: 'bg-caution' },
}

export function Toast({ type, message, onClose, duration = 3500 }: ToastProps) {
  const { icon: Icon, tone, ring } = variants[type]

  // Keep the latest onClose without restarting the dismiss timer each render.
  const onCloseRef = React.useRef(onClose)
  React.useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  React.useEffect(() => {
    const timer = setTimeout(() => onCloseRef.current(), duration)
    return () => clearTimeout(timer)
  }, [duration])

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise fixed right-6 top-6 z-50 flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-xl border border-hairline bg-surface p-4 shadow-lifted"
    >
      <span className={clsx('absolute inset-y-0 left-0 w-1', ring)} />
      <Icon className={clsx('h-5 w-5 shrink-0', tone)} />
      <p className="flex-1 pt-0.5 text-sm font-medium text-ink">{message}</p>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="-m-1 shrink-0 rounded-lg p-1 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
