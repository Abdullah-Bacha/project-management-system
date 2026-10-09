import type { AttachmentKind } from './attachment'

/** A link to reference material for a project: the expected website, a Figma design, a brief… */
export interface ReferenceLink {
  /** Optional name shown instead of the address. */
  label?: string
  url: string
}

/** A file shared with the whole project (not tied to one task), as the API returns it. */
export interface ProjectFileItem {
  _id: string
  name: string
  mimeType: string
  size: number
  kind: AttachmentKind
  uploadedBy: { _id: string; name: string } | null
  createdAt: string
}

export interface ProjectFileList {
  files: ProjectFileItem[]
  /** False when this server has no file storage configured: files can be listed but not added. */
  uploadsEnabled: boolean
}
