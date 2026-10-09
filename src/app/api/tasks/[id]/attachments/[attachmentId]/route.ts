import mongoose from 'mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { Attachment } from '@/lib/db/models'
import { authorizeTask } from '@/lib/auth/authorize'
import { getStorage } from '@/lib/storage'
import { canDeleteAttachment, removeAttachment } from '@/lib/services/attachments'

const ACCESS = { assigneeOrEditor: true } as const

type Params = { params: Promise<{ id: string; attachmentId: string }> }

/**
 * Authorize the task first, then fetch the attachment only through it:
 * `{ _id, taskId }` means an attachment id from another task (or another
 * project) is simply not found, whatever the caller types.
 */
async function resolve(request: NextRequest, { params }: Params) {
  const { id, attachmentId } = await params
  const auth = await authorizeTask(request, id, ACCESS)
  if (auth.response) return { response: auth.response }

  if (!mongoose.isValidObjectId(attachmentId)) {
    return { response: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }
  }
  const attachment = await Attachment.findOne({ _id: attachmentId, taskId: auth.data.task._id })
  if (!attachment) return { response: NextResponse.json({ error: 'Attachment not found' }, { status: 404 }) }

  return { auth: auth.data, attachment }
}

/**
 * Download. Always sent as an attachment with nosniff, never rendered by the
 * browser, so an uploaded file cannot run in the app origin. (The app-wide
 * Content-Security-Policy from next.config still applies to every response.)
 */
export async function GET(request: NextRequest, context: Params) {
  try {
    const found = await resolve(request, context)
    if (found.response) return found.response

    const storage = getStorage()
    const bytes = storage ? await storage.get(found.attachment.storageKey) : null
    if (!bytes) return NextResponse.json({ error: 'The file is no longer available.' }, { status: 404 })

    const encoded = encodeURIComponent(found.attachment.originalName).replace(/['()]/g, escape)
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': found.attachment.mimeType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Download attachment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Remove a file: the project owner / team leader may remove any; the assignee only what they uploaded. */
export async function DELETE(request: NextRequest, context: Params) {
  try {
    const found = await resolve(request, context)
    if (found.response) return found.response

    const { auth, attachment } = found
    if (!canDeleteAttachment({ isEditor: Boolean(auth.isEditor), userId: auth.userId, uploadedBy: attachment.uploadedBy })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const storage = getStorage()
    if (!storage) return NextResponse.json({ error: 'File storage is not configured on this server.' }, { status: 503 })

    const removed = await removeAttachment({ attachment, task: auth.task, project: auth.project, userId: auth.userId, storage })
    if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: 500 })

    return NextResponse.json({ message: 'Attachment deleted' }, { status: 200 })
  } catch (error) {
    console.error('Delete attachment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
