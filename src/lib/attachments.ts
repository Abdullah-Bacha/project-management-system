import type { AttachmentKind } from '@/types'

/**
 * What may be attached to a task, and how it is checked. Pure, so the browser
 * can refuse an obviously bad file early; the server runs the same checks
 * again (plus a look at the file's first bytes) and is the one that counts.
 */

/**
 * The largest file. In production it is 4 MB, because the host (Vercel) refuses a request body
 * over 4.5 MB before our code runs, so a bigger limit would only fail with an unhelpful error.
 * Everywhere else (development, tests) it is 10 MB.
 */
export const MAX_ATTACHMENT_MB = process.env.NODE_ENV === 'production' ? 4 : 10
export const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024
export const MAX_FILES_PER_REQUEST = 5
export const MAX_ATTACHMENTS_PER_TASK = 20
const MAX_NAME_LENGTH = 150

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

/** The allowlist: extension → the content types it may be sent as (the first is what we store) and its kind. */
const ALLOWED: Record<string, { mimes: string[]; kind: AttachmentKind }> = {
  pdf: { mimes: ['application/pdf'], kind: 'pdf' },
  png: { mimes: ['image/png'], kind: 'image' },
  jpg: { mimes: ['image/jpeg'], kind: 'image' },
  jpeg: { mimes: ['image/jpeg'], kind: 'image' },
  webp: { mimes: ['image/webp'], kind: 'image' },
  gif: { mimes: ['image/gif'], kind: 'image' },
  svg: { mimes: ['image/svg+xml'], kind: 'image' },
  txt: { mimes: ['text/plain'], kind: 'text' },
  csv: { mimes: ['text/csv', 'application/vnd.ms-excel', 'text/plain'], kind: 'spreadsheet' },
  doc: { mimes: ['application/msword'], kind: 'document' },
  docx: { mimes: [DOCX], kind: 'document' },
  xls: { mimes: ['application/vnd.ms-excel'], kind: 'spreadsheet' },
  xlsx: { mimes: [XLSX], kind: 'spreadsheet' },
  ppt: { mimes: ['application/vnd.ms-powerpoint'], kind: 'presentation' },
  pptx: { mimes: [PPTX], kind: 'presentation' },
  zip: { mimes: ['application/zip', 'application/x-zip-compressed'], kind: 'archive' },
}

/** Anything that could run on a server or a desktop. Refused even as a middle extension (report.exe.pdf). */
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'bat', 'cmd', 'com', 'ps1', 'sh', 'scr', 'msi', 'dll', 'jar', 'apk', 'vbs', 'js', 'mjs', 'cjs', 'php', 'asp', 'aspx', 'jsp', 'py', 'rb', 'pl', 'html', 'htm', 'xhtml', 'hta', 'lnk',
])

/** The extensions a file picker may offer. */
export const ACCEPTED_EXTENSIONS = Object.keys(ALLOWED).map((e) => `.${e}`).join(',')

export interface FileMeta {
  name: string
  type: string
  size: number
}

export type FileCheck =
  | { ok: true; name: string; extension: string; mimeType: string; kind: AttachmentKind }
  | { ok: false; error: string }

/** A safe display name: no path, no control characters, bounded length. */
export function cleanFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  return base.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_NAME_LENGTH)
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Name, declared type and size. Does not look inside the file (see `contentMatches`). */
export function checkFile(file: FileMeta): FileCheck {
  const name = cleanFileName(file.name)
  if (!name) return { ok: false, error: 'This file has no usable name.' }
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: 'This file is empty.' }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: `File is too large (the limit is ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB).` }
  }

  const parts = name.toLowerCase().split('.').slice(1)
  const extension = extensionOf(name)
  if (parts.some((part) => BLOCKED_EXTENSIONS.has(part))) return { ok: false, error: 'This file type is not supported.' }

  const rule = ALLOWED[extension]
  if (!rule) return { ok: false, error: 'This file type is not supported.' }

  // The browser's own idea of the type must agree with the extension (an empty one is judged by its content instead).
  const declared = file.type.trim().toLowerCase().split(';')[0]
  if (declared && !rule.mimes.includes(declared)) return { ok: false, error: 'This file type is not supported.' }

  return { ok: true, name, extension, mimeType: rule.mimes[0], kind: rule.kind }
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, i) => bytes[offset + i] === value)
const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to))

/** Does the start of the file really look like its extension says? Never trust the name or the declared type alone. */
export function contentMatches(extension: string, head: Uint8Array): boolean {
  switch (extension) {
    case 'pdf':
      return ascii(head, 0, 5) === '%PDF-'
    case 'png':
      return startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'jpg':
    case 'jpeg':
      return startsWith(head, [0xff, 0xd8, 0xff])
    case 'gif':
      return ['GIF87a', 'GIF89a'].includes(ascii(head, 0, 6))
    case 'webp':
      return ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP'
    case 'zip':
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])
    case 'doc':
    case 'xls':
    case 'ppt':
      return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    case 'svg': {
      const text = new TextDecoder().decode(head).replace(/^﻿/, '').trimStart().toLowerCase()
      const looksLikeSvg = text.startsWith('<svg') || text.startsWith('<?xml') || text.startsWith('<!doctype svg') || text.startsWith('<!--')
      // An SVG can carry script; refuse the ones that do.
      return looksLikeSvg && !/<script|javascript:|\son\w+\s*=/.test(text)
    }
    case 'txt':
    case 'csv':
      return !head.includes(0)
    default:
      return false
  }
}

/** The kind (for the icon) of a stored MIME type. */
export function kindOfMime(mimeType: string): AttachmentKind {
  for (const rule of Object.values(ALLOWED)) if (rule.mimes[0] === mimeType) return rule.kind
  return 'document'
}
