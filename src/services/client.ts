import axios, { AxiosError, InternalAxiosRequestConfig, isAxiosError } from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

export const api = axios.create({ baseURL: API_URL })

/** Central place for the auth tokens, so storage details stay in one file. */
export const tokenStore = {
  get access() {
    return typeof window === 'undefined' ? null : localStorage.getItem('token')
  },
  get refresh() {
    return typeof window === 'undefined'
      ? null
      : localStorage.getItem('refreshToken')
  },
  set(token: string, refreshToken: string) {
    localStorage.setItem('token', token)
    localStorage.setItem('refreshToken', refreshToken)
  },
  clear() {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
  },
}

api.interceptors.request.use((config) => {
  const token = tokenStore.access
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

/**
 * Access tokens live for one hour. When one expires mid-session we exchange
 * the refresh token for a new pair and replay the failed request, so the user
 * is never bounced to the login screen while still holding a valid session.
 *
 * Concurrent 401s share a single refresh call — otherwise every in-flight
 * request would fire its own, and all but one would fail against a rotated
 * refresh token.
 */
let refreshInFlight: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  const refreshToken = tokenStore.refresh
  if (!refreshToken) throw new Error('No refresh token')

  // A bare axios call: `api` would recurse through this interceptor.
  const { data } = await axios.post(`${API_URL}/api/auth/refresh-token`, {
    refreshToken,
  })

  // If the user logged out while this call was in flight, storing the new
  // pair would silently re-authenticate a signed-out (possibly shared)
  // machine.
  if (!tokenStore.refresh) throw new Error('Logged out during refresh')

  tokenStore.set(data.token, data.refreshToken)
  return data.token
}

/**
 * Exchange the refresh token for a new pair. Shared by the 401 interceptor
 * below and the SSE client, so there is exactly one refresh path and
 * concurrent callers still collapse into a single request. A definitive
 * (4xx) rejection ends the session here, once, for every waiting caller.
 */
export function refreshSession(): Promise<string> {
  refreshInFlight ??= refreshAccessToken()
    .catch((err) => {
      const status = err?.response?.status
      if (status && status >= 400 && status < 500) onAuthFailure()
      throw err
    })
    .finally(() => {
      refreshInFlight = null
    })
  return refreshInFlight
}

function onAuthFailure() {
  tokenStore.clear()
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth')) {
    window.location.href = '/auth/login'
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean
    }

    const isAuthCall = original?.url?.includes('/api/auth/')

    if (error.response?.status !== 401 || original?._retried || isAuthCall) {
      return Promise.reject(error)
    }

    original._retried = true

    try {
      const token = await refreshSession()

      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    } catch (refreshErr: any) {
      // Only a definitive rejection of the refresh token (4xx) ends the
      // session. A network blip or 500 during refresh must not log the
      // user out — reject with the refresh error (not the original 401)
      // so callers treat it as transient and retry on their next request.
      const status = refreshErr?.response?.status
      if (status && status >= 400 && status < 500) {
        return Promise.reject(error)
      }
      return Promise.reject(refreshErr)
    }
  }
)

/** The server's `error` text from a failed request, or `fallback` (network error, 5xx, …). */
export function errorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const message = (error.response?.data as { error?: unknown } | undefined)?.error
    if (typeof message === 'string' && message) return message
  }
  return fallback
}
