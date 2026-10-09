import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { User } from '@/lib/db/models'
import { verifyPassword } from '@/lib/auth/password'
import { generateTokenPair } from '@/lib/auth/jwt'
import {
  clientIp,
  loginKeys,
  loginRetryAfter,
  recordLoginFailure,
  clearLoginFailures,
} from '@/lib/auth/rate-limit'
import { loginSchema, parseBody } from '@/lib/validation'

const INVALID_CREDENTIALS = { error: 'Invalid email or password' }

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, loginSchema)
    if (body.response) return body.response

    const { email, password } = body.data

    const keys = loginKeys(clientIp(request), email)
    const retryAfter = loginRetryAfter(keys)
    if (retryAfter > 0) {
      return NextResponse.json(
        { error: 'Too many failed sign-in attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    await connectToDatabase()

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password')
    const passwordMatch = user ? await verifyPassword(password, user.password) : false
    if (!user || !passwordMatch) {
      recordLoginFailure(keys)
      return NextResponse.json(INVALID_CREDENTIALS, { status: 401 })
    }

    // Checked only after the password is proven, so this message cannot be
    // used to learn whether an arbitrary address belongs to a suspended user.
    if (user.status === 'suspended') {
      return NextResponse.json(
        { error: 'This account has been suspended. Contact an administrator.' },
        { status: 403 }
      )
    }

    clearLoginFailures(keys)

    const { token, refreshToken } = generateTokenPair({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      tv: user.tokenVersion ?? 0,
    })

    return NextResponse.json(
      {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          profilePicture: user.profilePicture,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        token,
        refreshToken,
      },
      { status: 200 }
    )
  } catch (err: any) {
    console.error('[Login] Error:', err.message)

    if (err.name === 'MongooseServerSelectionError' || err.message?.includes('querySrv')) {
      return NextResponse.json(
        { error: 'Database temporarily unavailable. Please try again shortly.' },
        { status: 503 }
      )
    }

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
