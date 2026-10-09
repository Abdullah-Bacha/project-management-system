import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { User } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { parseBody } from '@/lib/validation'
import { profilePictureUpdateSchema } from '@/lib/validation/profile-picture'
import { USER_ROLES, USER_STATUSES } from '@/types'
import { z } from 'zod'

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(30).optional(),
  profilePicture: profilePictureUpdateSchema.optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authorizeAdmin(request, { blockDemo: true })
    if (auth.response) return auth.response

    const { id } = await params
    if (!mongoose.isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const body = await parseBody(request, updateUserSchema)
    if (body.response) return body.response
    const changes = body.data

    // An admin demoting or suspending themself is how a team loses its only
    // admin with no one able to undo it. Force that to happen from a
    // different admin account instead.
    const demotingSelf =
      id === auth.data.userId &&
      ((changes.role && changes.role !== 'admin') ||
        (changes.status && changes.status !== 'active'))

    if (demotingSelf) {
      return NextResponse.json(
        { error: 'You cannot change your own admin role or status' },
        { status: 400 }
      )
    }

    if (changes.role && changes.role !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' })
      const target = await User.findById(id).select('role')
      if (target?.role === 'admin' && adminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote the last remaining admin' },
          { status: 400 }
        )
      }
    }

    const user = await User.findByIdAndUpdate(id, changes, { new: true }).select(
      'name email role status phone profilePicture createdAt'
    )

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ message: 'User updated', user }, { status: 200 })
  } catch (error) {
    console.error('Admin update user error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
