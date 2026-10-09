import { NextRequest, NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db/mongodb'
import { ProjectTemplate } from '@/lib/db/models'
import { authorizeAdmin, authorizeProject } from '@/lib/auth/authorize'
import { blueprintsFromProject, nameKeyOf, toTemplateDto } from '@/lib/services/templates'
import { parseBody } from '@/lib/validation'
import { createTemplateSchema } from '@/lib/validation/templates'
import { TEMPLATE_LIMITS } from '@/types'

/**
 * Project templates belong to the admin who made them, the way a project belongs
 * to its owner. Only admins create projects, so only admins have templates;
 * everyone else is refused (403). Every query below is scoped by `createdBy`, so
 * another admin's templates are not visible and cannot be addressed by id.
 */

/** The caller's template library, most recently changed first. */
export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response
    await connectToDatabase()

    const templates = await ProjectTemplate.find({ createdBy: auth.data.userId })
      .sort({ updatedAt: -1 })
      .limit(TEMPLATE_LIMITS.perOwner)
      .lean()

    return NextResponse.json({ templates: templates.map(toTemplateDto) }, { status: 200 })
  } catch (error) {
    console.error('List templates error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Create a template from scratch, or save a project's structure with `fromProjectId`. */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeAdmin(request)
    if (auth.response) return auth.response

    const body = await parseBody(request, createTemplateSchema)
    if (body.response) return body.response
    const { userId } = auth.data

    await connectToDatabase()
    if ((await ProjectTemplate.countDocuments({ createdBy: userId })) >= TEMPLATE_LIMITS.perOwner) {
      return NextResponse.json({ error: `You can keep up to ${TEMPLATE_LIMITS.perOwner} templates. Delete one first.` }, { status: 400 })
    }

    let fields: {
      name: string
      description?: string
      category?: string
      projectDescription?: string
      requirements?: string
      tasks: { title: string; description?: string; priority?: string; dueOffsetDays?: number }[]
    }
    let truncated = false

    if ('fromProjectId' in body.data) {
      // Only the project's owner may turn it into a template (and it must be theirs to read).
      const project = await authorizeProject(request, body.data.fromProjectId, { ownerOnly: true })
      if (project.response) return project.response

      const p = project.data.project
      const { blueprints, truncated: cut } = await blueprintsFromProject(p)
      truncated = cut
      fields = {
        name: (body.data.name ?? `${p.title} template`).slice(0, TEMPLATE_LIMITS.name.max),
        category: body.data.category,
        projectDescription: (p.description ?? '').slice(0, TEMPLATE_LIMITS.projectDescription),
        requirements: (p.requirements ?? '').slice(0, TEMPLATE_LIMITS.requirements),
        tasks: blueprints,
      }
    } else {
      fields = body.data
    }

    try {
      const template = await ProjectTemplate.create({
        ...fields,
        name: fields.name.trim(),
        nameKey: nameKeyOf(fields.name),
        createdBy: userId, // never taken from the request
      })
      return NextResponse.json({ message: 'Template saved', template: toTemplateDto(template), truncated }, { status: 201 })
    } catch (error: any) {
      // The unique (owner, name) index: a second identical submit, or a name already used.
      if (error?.code === 11000) {
        return NextResponse.json({ error: 'You already have a template with this name' }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    console.error('Create template error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
