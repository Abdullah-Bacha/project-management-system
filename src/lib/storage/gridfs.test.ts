import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough, Readable, Writable } from 'node:stream'

import { GridFsFileStorage, type BucketLike } from './gridfs'

const KEY = `${'a'.repeat(24)}/${'1'.repeat(8)}-1111-1111-1111-${'2'.repeat(12)}`

/** An in-memory stand-in for a GridFS bucket: same calls, same stream behaviour. */
function fakeBucket() {
  const files: { _id: number; filename: string; data: Buffer }[] = []
  let nextId = 1
  const bucket: BucketLike = {
    openUploadStream(filename) {
      const parts: Buffer[] = []
      return new Writable({
        write(chunk, _enc, cb) {
          parts.push(Buffer.from(chunk))
          cb()
        },
        final(cb) {
          files.push({ _id: nextId++, filename, data: Buffer.concat(parts) })
          cb()
        },
      })
    },
    openDownloadStreamByName(filename) {
      const file = files.find((f) => f.filename === filename)
      if (!file) {
        const missing = new PassThrough()
        setImmediate(() => missing.destroy(Object.assign(new Error('FileNotFound: file not found'), { name: 'MongoRuntimeError' })))
        return missing
      }
      // Hand the data over in two chunks, like GridFS does.
      const half = Math.ceil(file.data.length / 2)
      return Readable.from([file.data.subarray(0, half), file.data.subarray(half)])
    },
    find: ({ filename }) => ({ toArray: async () => files.filter((f) => f.filename === filename).map((f) => ({ _id: f._id })) }),
    async delete(id) {
      const i = files.findIndex((f) => f._id === id)
      if (i < 0) throw Object.assign(new Error('FileNotFound: no file'), { name: 'MongoGridFSChunkError' })
      files.splice(i, 1)
    },
  }
  return { bucket, files }
}

let storage: GridFsFileStorage
let fake: ReturnType<typeof fakeBucket>

beforeEach(() => {
  fake = fakeBucket()
  storage = new GridFsFileStorage('files', async () => fake.bucket)
})

describe('GridFS file storage', () => {
  it('stores a file and reads exactly the same bytes back', async () => {
    const bytes = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251))
    await storage.put(KEY, bytes)
    const back = await storage.get(KEY)
    expect(back?.equals(bytes)).toBe(true)
  })

  it('a file that is not there is null, not an error', async () => {
    expect(await storage.get(KEY)).toBeNull()
  })

  it('deletes a file, and deleting one that is already gone is fine', async () => {
    await storage.put(KEY, Buffer.from('%PDF-1.4'))
    await storage.delete(KEY)
    expect(await storage.get(KEY)).toBeNull()
    await expect(storage.delete(KEY)).resolves.toBeUndefined()
  })

  it('removes every copy stored under a key', async () => {
    await storage.put(KEY, Buffer.from('one'))
    await storage.put(KEY, Buffer.from('two'))
    await storage.delete(KEY)
    expect(fake.files).toHaveLength(0)
  })

  it('only touches the file it was asked for', async () => {
    const other = `${'b'.repeat(24)}/${'3'.repeat(8)}-3333-3333-3333-${'4'.repeat(12)}`
    await storage.put(KEY, Buffer.from('mine'))
    await storage.put(other, Buffer.from('theirs'))
    await storage.delete(KEY)
    expect((await storage.get(other))?.toString()).toBe('theirs')
  })

  it.each(['../../etc/passwd', 'a/b', '', `${'a'.repeat(24)}/../x`, 'projects/abc/def', `${'a'.repeat(24)}/${'x'.repeat(36)}`])('refuses the key %j', async (key) => {
    await expect(storage.put(key, Buffer.from('x'))).rejects.toThrow('Invalid storage key')
    await expect(storage.get(key)).rejects.toThrow('Invalid storage key')
    await expect(storage.delete(key)).rejects.toThrow('Invalid storage key')
    expect(fake.files).toHaveLength(0)
  })

  it('a failing upload is reported, not swallowed', async () => {
    const failing: BucketLike = {
      ...fake.bucket,
      openUploadStream: () =>
        new Writable({
          write(_c, _e, cb) {
            cb(new Error('disk full'))
          },
        }),
    }
    await expect(new GridFsFileStorage('files', async () => failing).put(KEY, Buffer.from('x'))).rejects.toThrow('disk full')
  })

  it('a real delete failure is not hidden', async () => {
    await storage.put(KEY, Buffer.from('x'))
    const broken: BucketLike = { ...fake.bucket, delete: async () => { throw new Error('connection lost') } }
    await expect(new GridFsFileStorage('files', async () => broken).delete(KEY)).rejects.toThrow('connection lost')
  })
})
