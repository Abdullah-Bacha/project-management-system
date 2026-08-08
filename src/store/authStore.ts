import { create } from 'zustand'
import { User, AuthResponse } from '@/types'

interface AuthStore {
  user: Omit<User, 'password'> | null
  token: string | null
  refreshToken: string | null
  isLoading: boolean
  error: string | null

  setAuth: (response: AuthResponse) => void
  setUser: (user: Omit<User, 'password'> | null) => void
  setToken: (token: string) => void
  setRefreshToken: (refreshToken: string) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  logout: () => void
  hydrate: () => void
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  refreshToken: null,
  isLoading: false,
  error: null,

  setAuth: (response) =>
    set({
      user: response.user,
      token: response.token,
      refreshToken: response.refreshToken,
      error: null,
    }),

  setUser: (user) => set({ user }),
  setToken: (token) => set({ token }),
  setRefreshToken: (refreshToken) => set({ refreshToken }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  logout: () =>
    set({
      user: null,
      token: null,
      refreshToken: null,
      error: null,
    }),

  hydrate: () => {
    if (typeof window === 'undefined') return

    const token = localStorage.getItem('token')
    const refreshToken = localStorage.getItem('refreshToken')
    const user = localStorage.getItem('user')

    if (token && user) {
      set({
        token,
        refreshToken,
        user: JSON.parse(user),
      })
    }
  },
}))
