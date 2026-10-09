import { GridFsFileStorage } from './gridfs'
import { LocalFileStorage } from './local'

/**
 * Where attachment files live. The database holds only the metadata and a
 * storage key; the bytes go through this interface so a real provider (S3,
 * Cloudinary, Vercel Blob …) can be added later as one more implementation
 * without touching the routes.
 */
export interface FileStorage {
  /** Short name for logs and messages. */
  readonly name: string
  put(key: string, data: Buffer): Promise<void>
  /** The file, or null if it is not there. */
  get(key: string): Promise<Buffer | null>
  /** Removes the file; removing one that is already gone is not an error. */
  delete(key: string): Promise<void>
}

let local: FileStorage | undefined
let database: FileStorage | undefined

/**
 * The storage this server uses.
 *
 * Production keeps files in the app's own MongoDB (GridFS): a serverless host
 * has no disk that lasts, and this needs no extra service or credentials.
 * Outside production, files go to a local folder (`.uploads`) so the feature
 * can be developed and tested without touching the database. Both are behind
 * the same interface, so another provider can be added later as one more
 * implementation.
 */
export function getStorage(): FileStorage | null {
  if (process.env.NODE_ENV === 'production') return (database ??= new GridFsFileStorage())
  return (local ??= new LocalFileStorage())
}
