'use client'

import { useState } from 'react'
import { Toast } from '@/components/ui/Toast'

type ToastType = 'success' | 'error' | 'info' | 'warning'

/**
 * Toast state in one line:
 *
 *   const { notify, toastNode } = useToast()
 *   notify('success', 'Saved')       // anywhere
 *   return <div>… {toastNode}</div>  // once, in the JSX
 */
export function useToast() {
  const [toast, setToast] = useState<{ type: ToastType; message: string } | null>(null)

  const notify = (type: ToastType, message: string) => setToast({ type, message })

  const toastNode = toast ? (
    <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
  ) : null

  return { notify, toastNode }
}
