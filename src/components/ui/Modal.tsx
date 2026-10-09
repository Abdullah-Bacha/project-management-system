'use client'

import React, { useEffect } from 'react'
import clsx from 'clsx'
import { X } from 'lucide-react'

interface ModalProps {
  title: string
  onClose: () => void
  /** `right` renders a full-height side drawer; `center` a centred dialog. */
  placement?: 'center' | 'right'
  children: React.ReactNode
}

/** A dialog with a dimmed backdrop. Escape and a backdrop click close it. */
export function Modal({ title, onClose, placement = 'center', children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const drawer = placement === 'right'

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex',
        drawer ? 'justify-end' : 'items-center justify-center p-4'
      )}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="animate-fade absolute inset-0 bg-scrim/30 backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'animate-rise relative flex w-full flex-col bg-surface shadow-lifted',
          drawer
            ? 'h-full max-w-lg border-l border-hairline'
            : 'max-h-full max-w-lg rounded-card border border-hairline'
        )}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-hairline px-5 py-4">
          <h2 className="text-sm font-medium text-ink-muted">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
            aria-label={`Close ${title.toLowerCase()}`}
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
