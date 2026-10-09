import { NextResponse } from 'next/server'

/**
 * The public demo account (its credentials are shown on the login page on
 * purpose). It is a normal admin, so without a guard any visitor could
 * suspend real users or rewrite real teams, and read their email addresses.
 * These helpers keep it a sandbox: it may create and work its own projects,
 * but cannot manage users/teams, and other people's emails are masked.
 *
 * The robust fix for a real deployment is a separate demo database; this is
 * the safety net for when the demo shares one with real data.
 */
const DEMO_EMAIL = (process.env.DEMO_ACCOUNT_EMAIL ?? 'testing@gmail.com').toLowerCase()

export function isDemoAccount(email?: string | null): boolean {
  return Boolean(email) && email!.toLowerCase() === DEMO_EMAIL
}

export function demoForbidden() {
  return NextResponse.json(
    { error: 'The shared demo account cannot manage users or teams.' },
    { status: 403 }
  )
}

function maskEmail(email: string) {
  const [name, domain] = email.split('@')
  if (!domain) return '•••'
  return `${name.slice(0, 1)}•••@${domain}`
}

/**
 * For the demo account, mask every `email` field in a response (other than
 * the demo account's own). Everyone else gets the data back untouched.
 */
export function redactForDemo<T>(viewerEmail: string | undefined, payload: T): T {
  if (!isDemoAccount(viewerEmail)) return payload

  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [
          key,
          key === 'email' && typeof v === 'string' && !isDemoAccount(v) ? maskEmail(v) : walk(v),
        ])
      )
    }
    return value
  }
  return walk(JSON.parse(JSON.stringify(payload))) as T
}
