import { describe, expect, it } from 'vitest'
import { MAX_ATTACHMENT_BYTES, checkFile, cleanFileName, contentMatches, extensionOf, kindOfMime } from './attachments'

const bytes = (...values: number[]) => new Uint8Array(values)
const text = (value: string) => new TextEncoder().encode(value)

describe('which files are allowed', () => {
  it.each([
    ['spec.pdf', 'application/pdf'],
    ['shot.png', 'image/png'],
    ['photo.JPG', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['pic.webp', 'image/webp'],
    ['anim.gif', 'image/gif'],
    ['logo.svg', 'image/svg+xml'],
    ['notes.txt', 'text/plain'],
    ['data.csv', 'text/csv'],
    ['data.csv', 'application/vnd.ms-excel'],
    ['brief.doc', 'application/msword'],
    ['brief.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['sheet.xls', 'application/vnd.ms-excel'],
    ['sheet.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['deck.ppt', 'application/vnd.ms-powerpoint'],
    ['deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['bundle.zip', 'application/zip'],
    ['bundle.zip', 'application/x-zip-compressed'],
  ])('accepts %s sent as %s', (name, type) => {
    expect(checkFile({ name, type, size: 1000 }).ok).toBe(true)
  })

  it('accepts a file whose type the browser could not name, to be judged by its content', () => {
    expect(checkFile({ name: 'spec.pdf', type: '', size: 1000 }).ok).toBe(true)
  })

  it.each(['run.exe', 'run.bat', 'run.cmd', 'run.ps1', 'run.sh', 'app.js', 'page.html', 'index.php', 'lib.dll', 'setup.msi', 'x.jar', 'x.lnk', 'noextension', '.pdf'])(
    'refuses %s',
    (name) => {
      expect(checkFile({ name, type: '', size: 1000 })).toMatchObject({ ok: false })
    }
  )

  it('refuses a dangerous extension hidden before a safe one', () => {
    expect(checkFile({ name: 'report.exe.pdf', type: 'application/pdf', size: 1000 })).toMatchObject({ ok: false })
    expect(checkFile({ name: 'invoice.sh.txt', type: 'text/plain', size: 1000 })).toMatchObject({ ok: false })
  })

  it('refuses a name and type that disagree', () => {
    expect(checkFile({ name: 'spec.pdf', type: 'image/png', size: 1000 })).toMatchObject({ ok: false })
    expect(checkFile({ name: 'shot.png', type: 'application/x-msdownload', size: 1000 })).toMatchObject({ ok: false })
    expect(checkFile({ name: 'shot.png', type: 'application/octet-stream', size: 1000 })).toMatchObject({ ok: false })
  })

  it('stores the type the server works out, not the one the client claimed', () => {
    const checked = checkFile({ name: 'data.csv', type: 'application/vnd.ms-excel', size: 10 })
    expect(checked).toMatchObject({ ok: true, mimeType: 'text/csv', kind: 'spreadsheet' })
  })
})

describe('file size', () => {
  it('allows up to the limit and refuses beyond it', () => {
    expect(checkFile({ name: 'a.pdf', type: 'application/pdf', size: MAX_ATTACHMENT_BYTES }).ok).toBe(true)
    const big = checkFile({ name: 'a.pdf', type: 'application/pdf', size: MAX_ATTACHMENT_BYTES + 1 })
    expect(big).toMatchObject({ ok: false })
    expect(big.ok === false && big.error).toContain('too large')
  })

  it('refuses an empty file or a nonsense size', () => {
    expect(checkFile({ name: 'a.pdf', type: '', size: 0 })).toMatchObject({ ok: false })
    expect(checkFile({ name: 'a.pdf', type: '', size: -5 })).toMatchObject({ ok: false })
    expect(checkFile({ name: 'a.pdf', type: '', size: Number.NaN })).toMatchObject({ ok: false })
  })
})

describe('file names', () => {
  it('drops any path and control characters', () => {
    expect(cleanFileName('../../etc/passwd')).toBe('passwd')
    expect(cleanFileName('C:\\Users\\me\\spec.pdf')).toBe('spec.pdf')
    expect(cleanFileName('spec\u0000.pdf')).toBe('spec.pdf')
    expect(cleanFileName('  spec.pdf  ')).toBe('spec.pdf')
  })

  it('keeps a long name within bounds and an empty one is refused', () => {
    expect(cleanFileName('a'.repeat(300) + '.pdf').length).toBe(150)
    expect(checkFile({ name: '   ', type: '', size: 10 })).toMatchObject({ ok: false })
    expect(checkFile({ name: '/', type: '', size: 10 })).toMatchObject({ ok: false })
  })

  it('finds the extension from the last dot', () => {
    expect(extensionOf('a.b.PDF')).toBe('pdf')
    expect(extensionOf('noext')).toBe('')
  })
})

describe('what is really inside the file', () => {
  it('recognises each kind by its first bytes', () => {
    expect(contentMatches('pdf', text('%PDF-1.7\n'))).toBe(true)
    expect(contentMatches('png', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe(true)
    expect(contentMatches('jpg', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true)
    expect(contentMatches('gif', text('GIF89a....'))).toBe(true)
    expect(contentMatches('webp', text('RIFF\u0001\u0002\u0003\u0004WEBPVP8 '))).toBe(true)
    for (const ext of ['zip', 'docx', 'xlsx', 'pptx']) expect(contentMatches(ext, bytes(0x50, 0x4b, 0x03, 0x04, 0))).toBe(true)
    for (const ext of ['doc', 'xls', 'ppt']) expect(contentMatches(ext, bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1))).toBe(true)
    expect(contentMatches('txt', text('plain words'))).toBe(true)
    expect(contentMatches('csv', text('a,b\n1,2'))).toBe(true)
  })

  it('refuses a file that is not what its name says', () => {
    expect(contentMatches('pdf', bytes(0x89, 0x50, 0x4e, 0x47))).toBe(false)
    expect(contentMatches('png', text('%PDF-1.7'))).toBe(false)
    expect(contentMatches('jpg', text('MZ\u0090\u0000'))).toBe(false) // a Windows executable
    expect(contentMatches('docx', text('#!/bin/sh'))).toBe(false)
    expect(contentMatches('txt', bytes(0x4d, 0x5a, 0x00, 0x03))).toBe(false) // binary data with a NUL byte
  })

  it('accepts a plain SVG and refuses one that carries script', () => {
    expect(contentMatches('svg', text('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'))).toBe(true)
    expect(contentMatches('svg', text('<?xml version="1.0"?><svg></svg>'))).toBe(true)
    expect(contentMatches('svg', text('<svg><script>alert(1)</script></svg>'))).toBe(false)
    expect(contentMatches('svg', text('<svg onload="alert(1)"></svg>'))).toBe(false)
    expect(contentMatches('svg', text('<svg><a href="javascript:alert(1)"/></svg>'))).toBe(false)
    expect(contentMatches('svg', text('<html><body>not an svg</body></html>'))).toBe(false)
  })

  it('does not know types it does not allow', () => {
    expect(contentMatches('exe', text('MZ'))).toBe(false)
  })
})

describe('icons', () => {
  it('picks a kind from the stored type', () => {
    expect(kindOfMime('application/pdf')).toBe('pdf')
    expect(kindOfMime('image/png')).toBe('image')
    expect(kindOfMime('application/zip')).toBe('archive')
    expect(kindOfMime('something/else')).toBe('document')
  })
})
