import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, generateTokenPair } from '@/lib/auth/jwt'
import { tokenSchema } from '@/lib/auth/validation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const validation = tokenSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed' },
        { status: 400 }
      )
    }

    const { refreshToken } = validation.data

    const payload = verifyToken(refreshToken, true)
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid refresh token' },
        { status: 401 }
      )
    }

    const { token, refreshToken: newRefreshToken } = generateTokenPair({
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
    })

    return NextResponse.json(
      {
        message: 'Token refreshed successfully',
        token,
        refreshToken: newRefreshToken,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Token refresh error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
