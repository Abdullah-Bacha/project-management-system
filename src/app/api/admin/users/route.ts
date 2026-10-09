import { NextRequest, NextResponse } from 'next/server'
import { User } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { hashPassword } from '@/lib/auth/password'
import { redactForDemo } from '@/lib/auth/demo'
import { parseBody } from '@/lib/validation'
import { profilePictureSchema } from '@/lib/validation/profile-picture'
import { parsePagination, parseFilters } from '@/lib/validation/query'
import { USER_ROLES } from '@/types'
import { z } from 'zod'

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(USER_ROLES),
  phone: z.string().max(30).optional(),
  profilePicture: profilePictureSchema.optional(),
})

/**
 * List accounts for the admin panel — populating role pickers (team
 * leaders, developers) and the user-management table. Admin-only: unlike
 * /api/users/search this returns the full roster.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const { searchParams } = request.nextUrl
    const filters = parseFilters(searchParams, { role: z.enum(USER_ROLES).optional() })
    if (filters.response) return filters.response
    const { skip, limit } = parsePagination(searchParams, { defaultLimit: 50, maxLimit: 100 })

    const query = filters.data.role ? { role: filters.data.role } : {}

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name email role status phone profilePicture createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query),
    ])

    return NextResponse.json(redactForDemo(auth.data.email, { users, total }), { status: 200 })
  } catch (error) {
    console.error('Admin list users error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Create an account with a chosen role: how an admin onboards people (there is no self-registration). */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request, { blockDemo: true })
    if (auth.response) return auth.response

    const body = await parseBody(request, createUserSchema)
    if (body.response) return body.response

    const { name, email, password, role, phone, profilePicture } = body.data

    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: await hashPassword(password),
      role,
      phone: phone ?? '',
      profilePicture: profilePicture ?? '',
      status: 'active',
    })

    return NextResponse.json(
      {
        message: 'User created',
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          phone: user.phone,
          profilePicture: user.profilePicture,
          createdAt: user.createdAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Admin create user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
