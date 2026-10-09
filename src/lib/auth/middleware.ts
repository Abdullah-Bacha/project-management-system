import { NextRequest } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { User } from '@/lib/db/models'
import type { UserRole, UserStatus } from '@/types'
import { verifyToken, type JWTPayload } from './jwt'

/** The authenticated caller. Role, status and email come from the database, not the token. */
export type AuthUser = JWTPayload & { role: UserRole; status: UserStatus }

/**
 * Verify the Bearer token AND that the account behind it is still allowed in.
 *
 * A valid signature only proves the token was once issued. The account is
 * re-read on every call so that a suspended or removed user, a changed role,
 * or a password reset (which bumps `tokenVersion`) takes effect immediately
 * instead of when the access token expires.
 */
export async function authenticateRequest(
  request: NextRequest
): Promise<{ user: AuthUser; error: null } | { user: null; error: string }> {
  try {
    const authHeader = request.headers.get('authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return { user: null, error: 'Unauthorized' }
    }

    const token = authHeader.slice(7)
    const payload = verifyToken(token, false)

    if (!payload) {
      return { user: null, error: 'Invalid token' }
    }

    await connectToDatabase()
    const account = await User.findById(payload.userId).select('status role email tokenVersion')
    if (!account || account.status === 'suspended') {
      return { user: null, error: 'Unauthorized' }
    }
    if ((payload.tv ?? 0) !== (account.tokenVersion ?? 0)) {
      return { user: null, error: 'Unauthorized' }
    }

    return {
      user: { ...payload, email: account.email, role: account.role, status: account.status },
      error: null,
    }
  } catch {
    return { user: null, error: 'Authentication failed' }
  }
}
