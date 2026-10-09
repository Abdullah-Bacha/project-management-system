import { NextRequest, NextResponse } from 'next/server'
import { ProjectFile } from '@/lib/db/models'
import { authorizeProject } from '@/lib/auth/authorize'
import { MAX_ATTACHMENT_BYTES, MAX_FILES_PER_REQUEST } from '@/lib/attachments'
import { RESOURCE_LIMITS } from '@/lib/project-resources'
import { getStorage } from '@/lib/storage'
import { actorName } from '@/lib/services/notifications'
import { saveProjectFile, serializeProjectFile } from '@/lib/services/project-files'
import type { ProjectFileItem } from '@/types'

/** A little more than the largest legitimate upload (the files plus form overhead). */
const MAX_REQUEST_BYTES = MAX_FILES_PER_REQUEST * MAX_ATTACHMENT_BYTES + 1024 * 1024

/**
 * The project's shared files, newest first. Every member can see them: the
 * owner, the team leader and the developers on the team.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id)
    if (auth.response) return auth.response

    const rows = await ProjectFile.find({ projectId: auth.data.project._id })
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'name')
      .lean()

    return NextResponse.json({ files: rows.map(serializeProjectFile), uploadsEnabled: getStorage() !== null }, { status: 200 })
  } catch (error) {
    console.error('List project files error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Add files (multipart field `files`). Only the project's owner or team leader may. Each file is judged on its own. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authorizeProject(request, id, { editorOnly: true })
    if (auth.response) return auth.response

    const storage = getStorage()
    if (!storage) {
      return NextResponse.json({ error: 'File storage is not configured on this server.' }, { status: 503 })
    }
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
      return NextResponse.json({ error: 'Upload the file as multipart form data.' }, { status: 400 })
    }
    if (Number(request.headers.get('content-length') ?? 0) > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: 'The upload is too large.' }, { status: 413 })
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: 'The upload could not be read.' }, { status: 400 })
    }

    const files = form.getAll('files').filter((value): value is File => typeof value !== 'string')
    if (files.length === 0) return NextResponse.json({ error: 'No file was provided.' }, { status: 400 })
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ error: `Add at most ${MAX_FILES_PER_REQUEST} files at a time.` }, { status: 400 })
    }

    const { userId, project } = auth.data
    const uploaderName = await actorName(userId)
    let existing = await ProjectFile.countDocuments({ projectId: project._id })

    const saved: ProjectFileItem[] = []
    const rejected: { name: string; error: string }[] = []
    for (const file of files) {
      if (existing >= RESOURCE_LIMITS.files) {
        rejected.push({ name: file.name, error: `A project can have at most ${RESOURCE_LIMITS.files} shared files.` })
        continue
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        rejected.push({ name: file.name, error: 'File is too large.' })
        continue
      }
      const result = await saveProjectFile({
        projectId: project._id,
        userId,
        uploaderName,
        file: { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
        storage,
      })
      if (result.ok) {
        saved.push(result.file)
        existing += 1
      } else {
        rejected.push({ name: file.name, error: result.error })
      }
    }

    if (saved.length === 0) {
      return NextResponse.json({ error: rejected[0]?.error ?? 'Upload failed.', files: saved, rejected }, { status: 400 })
    }
    return NextResponse.json({ files: saved, rejected }, { status: 201 })
  } catch (error) {
    console.error('Upload project file error:', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
