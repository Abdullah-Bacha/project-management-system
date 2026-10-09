import type { NextRequest } from 'next/server'

/**
 * Brute-force protection for sign-in, kept in process memory.
 *
 * Failed attempts are counted per (client IP + email) and per client IP, so an
 * attacker hammering one account — or spraying many — gets blocked, while a
 * stranger failing against the shared demo account cannot lock everyone else
 * out of it. Limits: 8 failures per account and 30 per IP, per 15 minutes.
 *
 * Memory is per server process: this is meant for a single Node server. On a
 * multi-instance or serverless deployment each instance counts separately, and
 * a shared store (Redis, etc.) would replace the Map below.
 */
const WINDOW_MS = 15 * 60 * 1000
const MAX_PER_ACCOUNT = 8
const MAX_PER_IP = 30
const MAX_TRACKED_KEYS = 5000

const failures = new Map<string, { count: number; resetAt: number }>()

/** Best-effort client address. Only trustworthy behind a proxy that sets the header. */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
}

function entry(key: string, now: number) {
  const current = failures.get(key)
  return current && current.resetAt > now ? current : undefined
}

export function loginKeys(ip: string, email: string) {
  return { account: `acct:${ip}:${email.toLowerCase()}`, ip: `ip:${ip}` }
}

/** Seconds until the caller may retry, or 0 if they are not blocked. */
export function loginRetryAfter(keys: { account: string; ip: string }): number {
  const now = Date.now()
  const blocked = [
    [keys.account, MAX_PER_ACCOUNT],
    [keys.ip, MAX_PER_IP],
  ] as const

  let wait = 0
  for (const [key, max] of blocked) {
    const e = entry(key, now)
    if (e && e.count >= max) wait = Math.max(wait, Math.ceil((e.resetAt - now) / 1000))
  }
  return wait
}

export function recordLoginFailure(keys: { account: string; ip: string }) {
  const now = Date.now()

  if (failures.size >= MAX_TRACKED_KEYS) {
    for (const [key, e] of failures) if (e.resetAt <= now) failures.delete(key)
    if (failures.size >= MAX_TRACKED_KEYS) failures.clear() // pathological: shed everything
  }

  for (const key of [keys.account, keys.ip]) {
    const current = entry(key, now)
    if (current) current.count += 1
    else failures.set(key, { count: 1, resetAt: now + WINDOW_MS })
  }
}

/** A successful sign-in forgives that account's earlier typos. */
export function clearLoginFailures(keys: { account: string }) {
  failures.delete(keys.account)
}

/** Test hook. */
export function resetLoginLimiter() {
  failures.clear()
}
