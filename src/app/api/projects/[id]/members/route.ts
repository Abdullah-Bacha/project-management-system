import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { Project, Task, User } from '@/lib/db/models'
import { authorizeProject } from '@/lib/auth/authorize'
import { z } from 'zod'
import { parseBody, objectIdString } from '@/lib/validation'

const addMemberSchema = z.object({
  userId: objectIdString,
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { populate: ['members'] })
    if (auth.response) return auth.response

    return NextResponse.json(
      { members: auth.data.project.members },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get members error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { ownerOnly: true })
    if (auth.response) return auth.response

    const validation = await parseBody(request, addMemberSchema)
    if (validation.response) return validation.response

    const { project } = auth.data
    const { userId } = validation.data

    const invitee = await User.findById(userId).select('name email')
    if (!invitee) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // members holds ObjectIds; Array.includes on a string never matches, so
    // compare stringified ids or the same member gets pushed repeatedly.
    const alreadyMember = project.members.some(
      (m: any) => (m?._id ?? m).toString() === userId
    )

    if (!alreadyMember) {
      project.members.push(new mongoose.Types.ObjectId(userId))
      await project.save()
    }

    await project.populate('members', 'name email profilePicture role')

    return NextResponse.json({ message: 'Member added', project }, { status: 200 })
  } catch (error) {
    console.error('Add member error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { ownerOnly: true })
    if (auth.response) return auth.response

    const userId = request.nextUrl.searchParams.get('userId')
    if (!userId || !mongoose.isValidObjectId(userId)) {
      return NextResponse.json({ error: 'Invalid user id' }, { status: 400 })
    }

    const { project } = auth.data

    // The owner must stay a member, otherwise the project becomes unreachable.
    if (project.owner.toString() === userId) {
      return NextResponse.json(
        { error: 'The project owner cannot be removed' },
        { status: 400 }
      )
    }

    project.members = project.members.filter(
      (m: any) => (m?._id ?? m).toString() !== userId
    )
    await project.save()

    // Leave their tasks in place but unassigned, so no work silently vanishes.
    await Task.updateMany(
      { projectId: id, assignedTo: userId },
      { $unset: { assignedTo: '' } }
    )

    await project.populate('members', 'name email profilePicture role')

    return NextResponse.json({ message: 'Member removed', project }, { status: 200 })
  } catch (error) {
    console.error('Remove member error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
