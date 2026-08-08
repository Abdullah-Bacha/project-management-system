import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { User } from '@/lib/db/models'
import { authenticateRequest } from '@/lib/auth/middleware'

export async function GET(request: NextRequest) {
  try {
    const { user, error } = await authenticateRequest(request)

    if (error || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    await connectToDatabase()

    const userData = await User.findById(user.userId)
    if (!userData) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    const userWithoutPassword = {
      _id: userData._id,
      name: userData.name,
      email: userData.email,
      profilePicture: userData.profilePicture,
      role: userData.role,
      status: userData.status,
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
    }

    return NextResponse.json(
      {
        message: 'User fetched successfully',
        user: userWithoutPassword,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get user error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
