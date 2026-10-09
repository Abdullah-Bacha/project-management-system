import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { LocalFileStorage } from './local'

const TASK = 'a'.repeat(24)
const key = (n: string) => `${TASK}/${n.repeat(36).slice(0, 36).replace(/[^a-f\d-]/g, '0')}`

let root: string
let storage: LocalFileStorage

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'taskflow-storage-test-'))
  storage = new LocalFileStorage(root)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('local development storage', () => {
  it('stores, reads and removes a file', async () => {
    await storage.put(key('1'), Buffer.from('hello'))
    expect((await storage.get(key('1')))?.toString()).toBe('hello')

    await storage.delete(key('1'))
    expect(await storage.get(key('1'))).toBeNull()
    // The task folder is tidied up once it is empty.
    expect(existsSync(path.join(root, TASK))).toBe(false)
  })

  it('reading or deleting a file that is not there is not an error', async () => {
    expect(await storage.get(key('2'))).toBeNull()
    await expect(storage.delete(key('2'))).resolves.toBeUndefined()
  })

  it('never overwrites an existing file', async () => {
    await storage.put(key('3'), Buffer.from('first'))
    await expect(storage.put(key('3'), Buffer.from('second'))).rejects.toThrow()
    expect((await storage.get(key('3')))?.toString()).toBe('first')
  })

  it.each(['../secret', `${TASK}/../../secret`, '/etc/passwd', 'C:\\windows\\system32', `${TASK}/x`, '', `${TASK}/${'a'.repeat(36)}/extra`])(
    'refuses a key that is not one of ours: %j',
    async (bad) => {
      await expect(storage.put(bad, Buffer.from('x'))).rejects.toThrow('Invalid storage key')
      await expect(storage.get(bad)).rejects.toThrow('Invalid storage key')
      await expect(storage.delete(bad)).rejects.toThrow('Invalid storage key')
    }
  )
})
