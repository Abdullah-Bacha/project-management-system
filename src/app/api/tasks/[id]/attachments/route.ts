import { NextRequest, NextResponse } from 'next/server'
import { Attachment } from '@/lib/db/models'
import { authorizeTask } from '@/lib/auth/authorize'
import { MAX_ATTACHMENTS_PER_TASK, MAX_ATTACHMENT_BYTES, MAX_FILES_PER_REQUEST } from '@/lib/attachments'
import { getStorage } from '@/lib/storage'
import { actorName } from '@/lib/services/notifications'
import { saveAttachment, serializeAttachment } from '@/lib/services/attachments'
import type { UploadResult } from '@/types'

// The same access rule as the task itself: its assignee, or the project owner / team leader.
const ACCESS = { assigneeOrEditor: true } as const

/** A little more than the largest legitimate upload (the files plus form overhead). */
const MAX_REQUEST_BYTES = MAX_FILES_PER_REQUEST * MAX_ATTACHMENT_BYTES + 1024 * 1024

/** The task's attachments, newest first, and whether this server can take new ones. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeTask(request, id, ACCESS)
    if (auth.response) return auth.response

    const rows = await Attachment.find({ taskId: auth.data.task._id })
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'name')
      .lean()

    return NextResponse.json(
      { attachments: rows.map(serializeAttachment), uploadsEnabled: getStorage() !== null },
      { status: 200 }
    )
  } catch (error) {
    console.error('List attachments error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Add one or more files (multipart field `files`). Each file is checked on its
 * own: some can be saved while others are refused, and the answer says which.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const auth = await authorizeTask(request, id, ACCESS)
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

    const { userId, task, project } = auth.data
    const uploaderName = await actorName(userId)
    let existing = await Attachment.countDocuments({ taskId: task._id })

    const result: UploadResult = { attachments: [], rejected: [] }
    for (const file of files) {
      if (existing >= MAX_ATTACHMENTS_PER_TASK) {
        result.rejected.push({ name: file.name, error: `A task can have at most ${MAX_ATTACHMENTS_PER_TASK} files.` })
        continue
      }
      // Refuse an oversized file before reading it into memory.
      if (file.size > MAX_ATTACHMENT_BYTES) {
        result.rejected.push({ name: file.name, error: 'File is too large.' })
        continue
      }

      const saved = await saveAttachment({
        task,
        project,
        userId,
        uploaderName,
        file: { name: file.name, type: file.type, bytes: Buffer.from(await file.arrayBuffer()) },
        storage,
      })
      if (saved.ok) {
        result.attachments.push(saved.attachment)
        existing += 1
      } else {
        result.rejected.push({ name: file.name, error: saved.error })
      }
    }

    // Nothing saved: report the first reason as the error.
    if (result.attachments.length === 0) {
      return NextResponse.json({ error: result.rejected[0]?.error ?? 'Upload failed.', ...result }, { status: 400 })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Upload attachment error:', error)
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }
}
