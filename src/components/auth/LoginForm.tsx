'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { Mail, Lock } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Toast } from '@/components/ui/Toast'

export function LoginForm() {
  const { login, isLoading } = useAuth()
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({ email: '', password: '' })
  const [toast, setToast] = useState<{
    type: 'error' | 'success'
    message: string
  } | null>(null)

  const validateForm = () => {
    const newErrors = { email: '', password: '' }

    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }

    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters'
    }

    setErrors(newErrors)
    return !newErrors.email && !newErrors.password
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    try {
      await login(formData.email, formData.password)
    } catch (error: any) {
      setToast({
        type: 'error',
        message:
          error.response?.data?.error || 'Login failed. Please try again.',
      })
    }
  }

  const fillDemoCredentials = () => {
    setFormData({
      email: 'testing@gmail.com',
      password: 'testing@123',
    })
    setErrors({ email: '', password: '' })
  }

  return (
    <>
      <div className="rounded-card border border-hairline bg-surface p-8 shadow-lifted">
        <div className="mb-6 rounded-lg bg-blue-50 border border-blue-200 p-4">
          <p className="text-sm font-medium text-blue-900 mb-2">
            🎯 Demo Credentials Available
          </p>
          <p className="text-sm text-blue-800 mb-3">
            Use these credentials to test the application as an admin:
          </p>
          <div className="space-y-2 bg-white p-3 rounded border border-blue-100">
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-gray-700">testing@gmail.com</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('testing@gmail.com')
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Copy
              </button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-gray-700">testing@123</span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText('testing@123')
                }}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Copy
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={fillDemoCredentials}
            className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors"
          >
            → Fill in demo credentials
          </button>
        </div>

        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sign in to continue to your workspace.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input
            label="Email address"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="you@example.com"
            icon={<Mail className="h-4 w-4" />}
            value={formData.email}
            onChange={handleChange}
            error={errors.email}
            disabled={isLoading}
          />

          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            icon={<Lock className="h-4 w-4" />}
            value={formData.password}
            onChange={handleChange}
            error={errors.password}
            disabled={isLoading}
          />

          <Button type="submit" fullWidth isLoading={isLoading}>
            Sign in
          </Button>
        </form>

        <div className="mt-5 flex flex-col items-center gap-2 border-t border-hairline pt-5">
          <p className="text-sm text-ink-muted">
            Don&apos;t have an account? Ask your admin to create one for you.
          </p>
          <Link
            href="/auth/forgot-password"
            className="text-sm text-ink-faint transition-colors hover:text-ink-muted"
          >
            Forgot password?
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
