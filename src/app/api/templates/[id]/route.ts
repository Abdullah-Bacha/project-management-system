import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { ProjectTemplate } from '@/lib/db/models'
import { authorizeAdmin } from '@/lib/auth/authorize'
import { nameKeyOf, toTemplateDto } from '@/lib/services/templates'
import { parseBody, objectIdString } from '@/lib/validation'
import { templateSchema } from '@/lib/validation/templates'

type Params = { params: Promise<{ id: string }> }

const badId = () => NextResponse.json({ error: 'Invalid id' }, { status: 400 })
// Someone else's template and one that does not exist are answered alike.
const notFound = () => NextResponse.json({ error: 'Template not found' }, { status: 404 })

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const { id } = await params
    if (!objectIdString.safeParse(id).success) return badId()

    await connectToDatabase()
    const template = await ProjectTemplate.findOne({ _id: id, createdBy: auth.data.userId }).lean()
    if (!template) return notFound()

    return NextResponse.json({ template: toTemplateDto(template) }, { status: 200 })
  } catch (error) {
    console.error('Get template error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Replace a template's content. Projects already made from it are untouched. */
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const { id } = await params
    if (!objectIdString.safeParse(id).success) return badId()

    const body = await parseBody(request, templateSchema)
    if (body.response) return body.response

    await connectToDatabase()
    try {
      const template = await ProjectTemplate.findOneAndUpdate(
        { _id: id, createdBy: auth.data.userId },
        { ...body.data, name: body.data.name.trim(), nameKey: nameKeyOf(body.data.name) },
        { new: true, runValidators: true }
      ).lean()
      if (!template) return notFound()

      return NextResponse.json({ message: 'Template updated', template: toTemplateDto(template) }, { status: 200 })
    } catch (error: any) {
      if (error?.code === 11000) {
        return NextResponse.json({ error: 'You already have a template with this name' }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    console.error('Update template error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Delete the template, and only the template: projects and tasks made from it stay. */
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const { id } = await params
    if (!objectIdString.safeParse(id).success) return badId()

    await connectToDatabase()
    const result = await ProjectTemplate.deleteOne({ _id: id, createdBy: auth.data.userId })
    if (result.deletedCount === 0) return notFound()

    return NextResponse.json({ message: 'Template deleted' }, { status: 200 })
  } catch (error) {
    console.error('Delete template error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
