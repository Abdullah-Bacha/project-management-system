import { randomUUID } from 'crypto'
import { Attachment } from '@/lib/db/models'
import { checkFile, contentMatches, kindOfMime, MAX_ATTACHMENT_BYTES } from '@/lib/attachments'
import { getStorage, type FileStorage } from '@/lib/storage'
import type { AttachmentItem } from '@/types'
import { recordActivity } from './activity'

interface AttachmentDoc {
  _id: unknown
  taskId: unknown
  originalName: string
  mimeType: string
  size: number
  uploadedBy?: unknown
  createdAt: Date | string
}

const idOf = (value: any): string => String(value?._id ?? value)

/** The attachment as a client may see it: no storage key, no internal ids beyond its own. */
export function serializeAttachment(doc: AttachmentDoc): AttachmentItem {
  const uploader = doc.uploadedBy as { _id?: unknown; name?: string } | null | undefined
  return {
    _id: idOf(doc._id),
    taskId: idOf(doc.taskId),
    name: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    kind: kindOfMime(doc.mimeType),
    uploadedBy: uploader?.name ? { _id: idOf(uploader), name: uploader.name } : null,
    createdAt: new Date(doc.createdAt).toISOString(),
  }
}

export type SaveResult = { ok: true; attachment: AttachmentItem } | { ok: false; error: string }

/**
 * Validate one file, store it, and record it. Every check runs here on the
 * server regardless of what the browser did. If saving the record fails the
 * stored file is removed again, so nothing is left behind.
 */
export async function saveAttachment(params: {
  task: { _id: unknown }
  project: { _id: unknown }
  userId: string
  uploaderName: string
  file: { name: string; type: string; bytes: Buffer }
  storage: FileStorage
}): Promise<SaveResult> {
  const { task, project, userId, uploaderName, file, storage } = params

  // Judge the size from the bytes actually received, not from what a client said.
  const checked = checkFile({ name: file.name, type: file.type, size: file.bytes.length })
  if (!checked.ok) return checked
  if (!contentMatches(checked.extension, file.bytes.subarray(0, 8192))) {
    return { ok: false, error: 'The file content does not match its type.' }
  }

  const storageKey = `${String(task._id)}/${randomUUID()}`
  try {
    await storage.put(storageKey, file.bytes)
  } catch (error) {
    console.error('[attachments] storing a file failed:', error)
    return { ok: false, error: 'Upload failed. Please try again.' }
  }

  let doc: AttachmentDoc
  try {
    doc = await Attachment.create({
      taskId: task._id,
      projectId: project._id,
      uploadedBy: userId,
      originalName: checked.name,
      storageKey,
      mimeType: checked.mimeType,
      size: file.bytes.length,
    })
  } catch (error) {
    console.error('[attachments] saving the record failed:', error)
    await storage.delete(storageKey).catch(() => {})
    return { ok: false, error: 'Upload failed. Please try again.' }
  }

  await recordActivity({
    projectId: project._id,
    actorId: userId,
    type: 'ATTACHMENT_ADDED',
    taskId: task._id,
    metadata: { fileName: checked.name },
  })

  // Built from known fields: a Mongoose document keeps its values behind getters, so spreading it loses them.
  return {
    ok: true,
    attachment: serializeAttachment({
      _id: doc._id,
      taskId: task._id,
      originalName: checked.name,
      mimeType: checked.mimeType,
      size: file.bytes.length,
      uploadedBy: { _id: userId, name: uploaderName },
      createdAt: doc.createdAt,
    }),
  }
}

/** The task's editors may remove any file; anyone else only the ones they uploaded themselves. */
export function canDeleteAttachment(params: { isEditor: boolean; userId: string; uploadedBy: unknown }): boolean {
  return params.isEditor || idOf(params.uploadedBy) === params.userId
}

/**
 * Remove one attachment: the stored file first, then the record. If the file
 * cannot be removed the record is kept, so nothing is orphaned and the
 * delete can simply be tried again.
 */
export async function removeAttachment(params: {
  attachment: { _id: unknown; storageKey: string; originalName: string }
  task: { _id: unknown }
  project: { _id: unknown }
  userId: string
  storage: FileStorage
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { attachment, task, project, userId, storage } = params

  try {
    await storage.delete(attachment.storageKey)
  } catch (error) {
    console.error('[attachments] removing a stored file failed:', error)
    return { ok: false, error: 'Could not delete the file. Please try again.' }
  }

  await Attachment.deleteOne({ _id: attachment._id })
  await recordActivity({
    projectId: project._id,
    actorId: userId,
    type: 'ATTACHMENT_DELETED',
    taskId: task._id,
    metadata: { fileName: attachment.originalName },
  })
  return { ok: true }
}

/**
 * Clean up a deleted task's or project's files. A record is dropped only once
 * its file is gone, so a file that could not be removed stays findable
 * instead of becoming an orphan nobody knows about.
 */
async function removeMatching(filter: Record<string, unknown>) {
  const rows: { _id: unknown; storageKey: string }[] = await Attachment.find(filter).select('storageKey').lean()
  if (rows.length === 0) return

  const storage = getStorage()
  const removable: unknown[] = []
  for (const row of rows) {
    try {
      await storage?.delete(row.storageKey)
      removable.push(row._id)
    } catch (error) {
      console.error('[attachments] cleanup could not remove a file:', error)
    }
  }
  if (removable.length > 0) await Attachment.deleteMany({ _id: { $in: removable } })
}

export const deleteTaskAttachments = (taskId: unknown) => removeMatching({ taskId })
export const deleteProjectAttachments = (projectId: unknown) => removeMatching({ projectId })

export { MAX_ATTACHMENT_BYTES }
