'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    // Hydrate store from localStorage
    useAuthStore.getState().hydrate()

    // Check auth status using getState() instead of hook
    const token = useAuthStore.getState().token
    if (token) {
      router.push('/dashboard')
    } else {
      router.push('/auth/login')
    }
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">TaskFlow</h1>
        <p className="text-gray-600">Redirecting...</p>
      </div>
    </div>
  )
}
