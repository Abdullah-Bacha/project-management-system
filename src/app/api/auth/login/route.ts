import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { User } from '@/lib/db/models'
import { verifyPassword } from '@/lib/auth/password'
import { generateTokenPair } from '@/lib/auth/jwt'
import { loginSchema } from '@/lib/auth/validation'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const validation = loginSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed' },
        { status: 400 }
      )
    }

    await connectToDatabase()

    const { email, password } = validation.data

    const user = await User.findOne({ email: email.toLowerCase() }).select('+password')
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const passwordMatch = await verifyPassword(password, user.password)
    if (!passwordMatch) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      )
    }

    const { token, refreshToken } = generateTokenPair({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    })

    const userWithoutPassword = {
      _id: user._id,
      name: user.name,
      email: user.email,
      profilePicture: user.profilePicture,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }

    return NextResponse.json(
      {
        user: userWithoutPassword,
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
