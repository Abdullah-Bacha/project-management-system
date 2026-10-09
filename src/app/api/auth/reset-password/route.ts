import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { connectToDatabase } from '@/lib/db/mongodb'
import { User } from '@/lib/db/models'
import { hashPassword } from '@/lib/auth/password'
import { z } from 'zod'
import { parseBody } from '@/lib/validation'

const schema = z.object({
  email: z.string().email(),
  token: z.string().min(32),
  password: z.string().min(6),
})

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody(request, schema, 'Password must be at least 6 characters')
    if (body.response) return body.response

    await connectToDatabase()

    const { email, token, password } = body.data
    const hash = crypto.createHash('sha256').update(token).digest('hex')

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      '+resetTokenHash +resetTokenExpires'
    )

    const stored = user?.resetTokenHash
    const expiry = user?.resetTokenExpires

    // Compare in constant time so response timing cannot leak the token.
    // timingSafeEqual throws on length mismatch, so check that first.
    const matches = (() => {
      if (!stored || stored.length !== hash.length) return false
      return crypto.timingSafeEqual(
        Buffer.from(stored, 'hex'),
        Buffer.from(hash, 'hex')
      )
    })()

    const valid = Boolean(
      matches && expiry && new Date(expiry).getTime() > Date.now()
    )

    if (!valid) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired.' },
        { status: 400 }
      )
    }

    await User.updateOne(
      { _id: user!._id },
      {
        $set: { password: await hashPassword(password) },
        // Revoke every token issued before the reset (a stolen session
        // must not survive the password change).
        $inc: { tokenVersion: 1 },
        // Single use: clear the token so the link cannot be replayed.
        $unset: { resetTokenHash: '', resetTokenExpires: '' },
      }
    )

    return NextResponse.json(
      { message: 'Password updated. You can sign in now.' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Reset password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
