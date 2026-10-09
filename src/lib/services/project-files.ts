import { randomUUID } from 'crypto'
import { ProjectFile } from '@/lib/db/models'
import { checkFile, contentMatches, kindOfMime } from '@/lib/attachments'
import { getStorage, type FileStorage } from '@/lib/storage'
import type { ProjectFileItem } from '@/types'

interface FileDoc {
  _id: unknown
  originalName: string
  mimeType: string
  size: number
  uploadedBy?: unknown
  createdAt: Date | string
}

const idOf = (value: any): string => String(value?._id ?? value)

/** The file as a client may see it: no storage key, no internal ids beyond its own. */
export function serializeProjectFile(doc: FileDoc): ProjectFileItem {
  const uploader = doc.uploadedBy as { _id?: unknown; name?: string } | null | undefined
  return {
    _id: idOf(doc._id),
    name: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    kind: kindOfMime(doc.mimeType),
    uploadedBy: uploader?.name ? { _id: idOf(uploader), name: uploader.name } : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  }
}

export type SaveProjectFileResult = { ok: true; file: ProjectFileItem } | { ok: false; error: string }

/**
 * Validate one file with the same rules as task attachments (allowed types,
 * size, and a look at the file's first bytes), store it, and record it. If
 * saving the record fails the stored file is removed again.
 */
export async function saveProjectFile(params: {
  projectId: unknown
  userId: string
  uploaderName: string
  file: { name: string; type: string; bytes: Buffer }
  storage: FileStorage
}): Promise<SaveProjectFileResult> {
  const { projectId, userId, uploaderName, file, storage } = params

  const checked = checkFile({ name: file.name, type: file.type, size: file.bytes.length })
  if (!checked.ok) return checked
  if (!contentMatches(checked.extension, file.bytes.subarray(0, 8192))) {
    return { ok: false, error: 'The file content does not match its type.' }
  }

  // `<projectId>/<uuid>`: the shape file storage expects (an id and a generated name, never client input).
  const storageKey = `${String(projectId)}/${randomUUID()}`
  try {
    await storage.put(storageKey, file.bytes)
  } catch (error) {
    console.error('[project-files] storing a file failed:', error)
    return { ok: false, error: 'Upload failed. Please try again.' }
  }

  let doc: FileDoc
  try {
    doc = await ProjectFile.create({
      projectId,
      uploadedBy: userId,
      originalName: checked.name,
      storageKey,
      mimeType: checked.mimeType,
      size: file.bytes.length,
    })
  } catch (error) {
    console.error('[project-files] saving the record failed:', error)
    await storage.delete(storageKey).catch(() => {})
    return { ok: false, error: 'Upload failed. Please try again.' }
  }

  return {
    ok: true,
    file: serializeProjectFile({
      _id: doc._id,
      originalName: checked.name,
      mimeType: checked.mimeType,
      size: file.bytes.length,
      uploadedBy: { _id: userId, name: uploaderName },
      createdAt: doc.createdAt,
    }),
  }
}

/** Remove the stored file first, then the record: if the file cannot be removed the record stays, so nothing is orphaned. */
export async function removeProjectFile(params: {
  file: { _id: unknown; storageKey: string }
  storage: FileStorage
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await params.storage.delete(params.file.storageKey)
  } catch (error) {
    console.error('[project-files] removing a stored file failed:', error)
    return { ok: false, error: 'Could not delete the file. Please try again.' }
  }
  await ProjectFile.deleteOne({ _id: params.file._id })
  return { ok: true }
}

/** Clean up a deleted project's shared files; a record is dropped only once its file is gone. */
export async function deleteProjectFiles(projectId: unknown) {
  const rows: { _id: unknown; storageKey: string }[] = await ProjectFile.find({ projectId }).select('storageKey').lean()
  if (rows.length === 0) return

  const storage = getStorage()
  const removable: unknown[] = []
  for (const row of rows) {
    try {
      await storage?.delete(row.storageKey)
      removable.push(row._id)
    } catch (error) {
      console.error('[project-files] cleanup could not remove a file:', error)
    }
  }
  if (removable.length > 0) await ProjectFile.deleteMany({ _id: { $in: removable } })
}
