import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { User } from '@/lib/db/models'
import { verifyToken, generateTokenPair } from '@/lib/auth/jwt'
import { tokenSchema, parseBody } from '@/lib/validation'

const INVALID = { error: 'Invalid refresh token' }

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, tokenSchema)
    if (body.response) return body.response

    // verifyToken rejects malformed, tampered and expired tokens alike.
    const payload = verifyToken(body.data.refreshToken, true)
    if (!payload) return NextResponse.json(INVALID, { status: 401 })

    // The token is stateless, so the account is the source of truth: a
    // suspended or removed user, or one whose credentials changed since the
    // token was issued (tokenVersion), must not be able to mint new tokens.
    // The new pair carries the account's current role/email.
    await connectToDatabase()
    const account = await User.findById(payload.userId).select(
      'email role status tokenVersion'
    )
    if (
      !account ||
      account.status === 'suspended' ||
      (payload.tv ?? 0) !== (account.tokenVersion ?? 0)
    ) {
      return NextResponse.json(INVALID, { status: 401 })
    }

    const { token, refreshToken } = generateTokenPair({
      userId: payload.userId,
      email: account.email,
      role: account.role,
      tv: account.tokenVersion ?? 0,
    })

    return NextResponse.json(
      { message: 'Token refreshed successfully', token, refreshToken },
      { status: 200 }
    )
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
