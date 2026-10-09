/** What a file looks like, for choosing an icon. */
export type AttachmentKind = 'pdf' | 'image' | 'document' | 'spreadsheet' | 'presentation' | 'archive' | 'text'

/** A file attached to a task, as the API returns it. The storage reference is never exposed. */
export interface AttachmentItem {
  _id: string
  taskId: string
  name: string
  mimeType: string
  size: number
  kind: AttachmentKind
  uploadedBy: { _id: string; name: string } | null
  createdAt: string
}

export interface AttachmentList {
  attachments: AttachmentItem[]
  /** False when this server has no file storage configured: files can be listed but not added. */
  uploadsEnabled: boolean
}

/** The answer to an upload request: what was saved, and what was refused and why. */
export interface UploadResult {
  attachments: AttachmentItem[]
  rejected: { name: string; error: string }[]
}
