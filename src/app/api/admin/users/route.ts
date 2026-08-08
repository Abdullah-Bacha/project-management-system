import { NextRequest, NextResponse } from 'next/server'
import { User } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { hashPassword } from '@/lib/auth/password'
import { ASSIGNABLE_ROLES } from '@/lib/roles'
import { z } from 'zod'

const ROLES = ASSIGNABLE_ROLES as [string, ...string[]]

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(ROLES),
})

/**
 * List accounts for the admin panel — populating role pickers (project
 * managers, team leaders, developers) and the user-management table.
 * Deliberately admin-only: unlike /api/users/search, this returns the full
 * roster rather than a short name/email match, so it must not be reachable
 * by a regular member.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const role = request.nextUrl.searchParams.get('role')
    const skip = parseInt(request.nextUrl.searchParams.get('skip') || '0')
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get('limit') || '50'),
      100
    )

    const query: any = {}
    if (role && ROLES.includes(role as any)) query.role = role

    const [users, total] = await Promise.all([
      User.find(query)
        .select('name email role status createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query),
    ])

    return NextResponse.json({ users, total }, { status: 200 })
  } catch (error) {
    console.error('Admin list users error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Create an account with a chosen role — how an admin onboards a project
 * manager, team leader, or developer directly, without them self-registering.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const body = await request.json()
    const validation = createUserSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: validation.error.issues },
        { status: 400 }
      )
    }

    const { name, email, password, role } = validation.data

    const existing = await User.findOne({ email: email.toLowerCase() })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: await hashPassword(password),
      role,
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
