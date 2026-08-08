'use client'

import { useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { api, tokenStore } from '@/lib/api/client'

export function useAuth() {
  const router = useRouter()
  const authStore = useAuthStore()

  // Runs once on mount; hydrate() only reads localStorage so it is idempotent.
  // authStore must stay out of the deps — the store hook returns a fresh
  // object each render, which would loop forever.
  useEffect(() => {
    authStore.hydrate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistSession = useCallback(
    (data: any) => {
      const { user, token, refreshToken } = data
      authStore.setAuth({ user, token, refreshToken })
      tokenStore.set(token, refreshToken)
      localStorage.setItem('user', JSON.stringify(user))
    },
    [authStore]
  )

  const login = useCallback(
    async (email: string, password: string) => {
      authStore.setLoading(true)
      authStore.setError(null)

      try {
        const { data } = await api.post('/api/auth/login', { email, password })
        persistSession(data)
        router.push('/dashboard')
        return data
      } catch (error: any) {
        authStore.setError(error.response?.data?.error || 'Login failed')
        throw error
      } finally {
        authStore.setLoading(false)
      }
    },
    [authStore, persistSession, router]
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout')
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      authStore.logout()
      tokenStore.clear()
      router.push('/auth/login')
    }
  }, [authStore, router])

  return {
    user: authStore.user,
    token: authStore.token,
    isLoading: authStore.isLoading,
    error: authStore.error,
    isAuthenticated: !!authStore.token,
    login,
    logout,
  }
}
