'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, MailCheck } from 'lucide-react'
import { api } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setError('Please enter a valid email')
      return
    }

    setError('')
    setLoading(true)
    try {
      await api.post('/api/auth/forgot-password', { email })
      setSent(true)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded-card border border-hairline bg-surface p-8 text-center shadow-lifted">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-positive/10 text-positive">
          <MailCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
          Check your email
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          If an account exists for <span className="font-medium">{email}</span>,
          we&apos;ve sent a link to reset your password. It expires in one hour.
        </p>
        <p className="mt-4 rounded-xl bg-surface-sunken px-3 py-2 text-xs text-ink-muted">
          No mail provider is configured yet, so in development the reset link
          is printed to the server console.
        </p>
        <Link
          href="/auth/login"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-card border border-hairline bg-surface p-8 shadow-lifted">
      <h1 className="text-xl font-semibold tracking-tight text-ink">
        Forgot your password?
      </h1>
      <p className="mt-1 text-sm text-ink-muted">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon={<Mail className="h-4 w-4" />}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError('')
          }}
          error={error}
          disabled={loading}
        />

        <Button type="submit" fullWidth isLoading={loading}>
          Send reset link
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
  )
}
