import mongoose from 'mongoose'
import { NextRequest, NextResponse } from 'next/server'
import { ProjectFile } from '@/lib/db/models'
import { authorizeProject } from '@/lib/auth/authorize'
import { getStorage } from '@/lib/storage'
import { removeProjectFile } from '@/lib/services/project-files'

type Params = { params: Promise<{ id: string; fileId: string }> }

/**
 * Authorize the project first (any member), then find the file only through
 * it: `{ _id, projectId }` means a file id from another project is simply not
 * found, whatever the caller types.
 */
async function resolve(request: NextRequest, { params }: Params, editorOnly: boolean) {
  const { id, fileId } = await params
  const auth = await authorizeProject(request, id, editorOnly ? { editorOnly: true } : {})
  if (auth.response) return { response: auth.response }

  if (!mongoose.isValidObjectId(fileId)) return { response: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }
  const file = await ProjectFile.findOne({ _id: fileId, projectId: auth.data.project._id })
  if (!file) return { response: NextResponse.json({ error: 'File not found' }, { status: 404 }) }
  return { file }
}

/**
 * Download, for any member of the project. Always sent as an attachment with
 * nosniff, never rendered by the browser, so an uploaded file cannot run in
 * the app origin.
 */
export async function GET(request: NextRequest, context: Params) {
  try {
    const found = await resolve(request, context, false)
    if (found.response) return found.response

    const storage = getStorage()
    const bytes = storage ? await storage.get(found.file.storageKey) : null
    if (!bytes) return NextResponse.json({ error: 'The file is no longer available.' }, { status: 404 })

    const encoded = encodeURIComponent(found.file.originalName).replace(/['()]/g, escape)
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': found.file.mimeType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename*=UTF-8''${encoded}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('Download project file error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** Remove a file. Only the project's owner or team leader. */
export async function DELETE(request: NextRequest, context: Params) {
  try {
    const found = await resolve(request, context, true)
    if (found.response) return found.response

    const storage = getStorage()
    if (!storage) return NextResponse.json({ error: 'File storage is not configured on this server.' }, { status: 503 })

    const removed = await removeProjectFile({ file: found.file, storage })
    if (!removed.ok) return NextResponse.json({ error: removed.error }, { status: 500 })
    return NextResponse.json({ message: 'File deleted' }, { status: 200 })
  } catch (error) {
    console.error('Delete project file error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
