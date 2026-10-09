'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { Lock, ArrowLeft, ShieldAlert } from 'lucide-react'
import { api } from '@/services/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast } from '@/components/ui/Toast'

function ResetPasswordForm() {
  const params = useSearchParams()
  const router = useRouter()

  const token = params.get('token') ?? ''
  const email = params.get('email') ?? ''

  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({ password: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)

  if (!token || !email) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-8 text-center shadow-lifted">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-critical-subtle text-critical">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
          Invalid reset link
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          This link is missing information. Request a new one.
        </p>
        <Link
          href="/auth/forgot-password"
          className="mt-5 inline-block text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          Request a new link
        </Link>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const next = { password: '', confirmPassword: '' }
    if (form.password.length < 6) {
      next.password = 'Password must be at least 6 characters'
    }
    if (form.password !== form.confirmPassword) {
      next.confirmPassword = 'Passwords do not match'
    }
    setErrors(next)
    if (next.password || next.confirmPassword) return

    setLoading(true)
    try {
      await api.post('/api/auth/reset-password', {
        email,
        token,
        password: form.password,
      })
      setToast({ type: 'success', message: 'Password updated. Redirecting…' })
      setTimeout(() => router.push('/auth/login'), 1200)
    } catch (e: any) {
      setToast({
        type: 'error',
        message: e.response?.data?.error || 'Could not reset password',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="rounded-card border border-hairline bg-surface p-8 shadow-lifted">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Choose a new password
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Resetting the password for <span className="font-medium">{email}</span>.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            icon={<Lock className="h-4 w-4" />}
            value={form.password}
            onChange={(e) => {
              setForm({ ...form, password: e.target.value })
              setErrors({ ...errors, password: '' })
            }}
            error={errors.password}
            helperText="At least 6 characters"
            disabled={loading}
          />

          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            icon={<Lock className="h-4 w-4" />}
            value={form.confirmPassword}
            onChange={(e) => {
              setForm({ ...form, confirmPassword: e.target.value })
              setErrors({ ...errors, confirmPassword: '' })
            }}
            error={errors.confirmPassword}
            disabled={loading}
          />

          <Button type="submit" fullWidth isLoading={loading}>
            Update password
          </Button>
        </form>

        <div className="mt-5 border-t border-hairline pt-5 text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to sign in
          </Link>
        </div>
      </div>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary during prerender.
  return (
    <Suspense
      fallback={<div className="skeleton h-80 w-full rounded-card" />}
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
