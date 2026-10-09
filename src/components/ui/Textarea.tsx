'use client'

import React from 'react'
import clsx from 'clsx'

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({ label, className, id, ...props }: TextareaProps) {
  const textareaId = id ?? props.name

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="mb-1.5 block text-sm font-medium text-ink-soft">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={clsx(
          'w-full resize-y rounded-xl border border-hairline bg-surface px-4 py-3 text-sm text-ink',
          'placeholder:text-ink-faint transition-all duration-200',
          'focus:border-focus focus:outline-none focus:ring-4 focus:ring-focus/12',
          className
        )}
        {...props}
      />
    </div>
  )
}
