import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { createProjectFromTemplate } from '@/lib/services/templates'
import { parseBody, objectIdString } from '@/lib/validation'
import { useTemplateSchema } from '@/lib/validation/templates'

/**
 * POST /api/templates/:id/use — create a project (and its tasks) from one of
 * the caller's templates. Admin-only, like creating any project; the new
 * project is owned by the caller, and every task starts in To Do, unassigned.
 * Ownership, status and assignment are never read from the request.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const { id } = await params
    if (!objectIdString.safeParse(id).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const body = await parseBody(request, useTemplateSchema)
    if (body.response) return body.response

    await connectToDatabase()
    const result = await createProjectFromTemplate({
      templateId: id,
      ownerId: auth.data.userId,
      input: body.data,
      serverToday: new Date().toISOString().slice(0, 10),
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    return NextResponse.json(
      { message: 'Project created from template', project: result.project, tasksCreated: result.tasksCreated, duplicate: result.duplicate },
      { status: result.duplicate ? 200 : 201 }
    )
  } catch (error) {
    console.error('Use template error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
