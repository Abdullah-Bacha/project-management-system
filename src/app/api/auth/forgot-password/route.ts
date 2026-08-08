import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { connectToDatabase } from '@/lib/db/mongodb'
import { User } from '@/lib/db/models'
import { z } from 'zod'

const schema = z.object({ email: z.string().email() })

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validation = schema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    await connectToDatabase()

    const email = validation.data.email.toLowerCase()
    const user = await User.findOne({ email })

    // Only mint a token when the account exists, but always answer the same
    // way — a different response for unknown emails would let anyone probe
    // which addresses are registered.
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex')
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex')

      // updateOne rather than assign-and-save: these paths are `select: false`,
      // so they are absent from the loaded document and a save() silently
      // drops them.
      await User.updateOne(
        { _id: user._id },
        {
          resetTokenHash: hash,
          resetTokenExpires: new Date(Date.now() + TOKEN_TTL_MS),
        }
      )

      const origin = request.nextUrl.origin
      const link = `${origin}/auth/reset-password?token=${rawToken}&email=${encodeURIComponent(email)}`

      // No mail provider is configured yet. Until one is wired in here, the
      // link is written to the server log so the flow is usable in
      // development — it is never returned in the response.
      console.log(`[password-reset] link for ${email}: ${link}`)
    }

    return NextResponse.json(
      {
        message:
          'If an account exists for that email, a reset link has been sent.',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Forgot password error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
