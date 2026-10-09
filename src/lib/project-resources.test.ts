import { describe, it, expect } from 'vitest'
import { hostOf, isFigma, linkTitle, normalizeUrl, RESOURCE_LIMITS } from './project-resources'
import { referenceLinkSchema, referenceLinksSchema } from './validation/project-resources'

describe('normalizeUrl: only http(s) addresses a person may safely open', () => {
  it('accepts http and https, and gives a bare address https', () => {
    expect(normalizeUrl('https://www.figma.com/file/abc/Design')).toBe('https://www.figma.com/file/abc/Design')
    expect(normalizeUrl('http://example.com')).toBe('http://example.com/')
    expect(normalizeUrl('  figma.com/file/abc  ')).toBe('https://figma.com/file/abc')
  })
  it.each([
    ['javascript:alert(1)'],
    ['JAVASCRIPT:alert(1)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['file:///etc/passwd'],
    ['ftp://example.com/a'],
    ['vbscript:x'],
    ['//evil.com'],
    ['not a url'],
    ['http://localhost'],
    [''],
    ['   '],
    ['https://' + 'a'.repeat(RESOURCE_LIMITS.linkUrl) + '.com'],
  ])('refuses %s', (value) => {
    expect(normalizeUrl(value)).toBeNull()
  })
})

describe('link helpers', () => {
  it('names a link by its label, else its host', () => {
    expect(linkTitle({ url: 'https://www.figma.com/file/x', label: ' Home design ' })).toBe('Home design')
    expect(linkTitle({ url: 'https://www.figma.com/file/x' })).toBe('figma.com')
    expect(hostOf('https://www.example.com/a')).toBe('example.com')
  })
  it('recognises Figma, and not look-alikes', () => {
    expect(isFigma('https://www.figma.com/file/x')).toBe(true)
    expect(isFigma('https://figma.com/design/x')).toBe(true)
    expect(isFigma('https://notfigma.com/x')).toBe(false)
    expect(isFigma('https://figma.com.evil.io/x')).toBe(false)
  })
})

describe('referenceLinks validation', () => {
  it('cleans each address and keeps the optional label', () => {
    expect(referenceLinkSchema.parse({ url: 'figma.com/file/a', label: ' Design ' })).toEqual({ url: 'https://figma.com/file/a', label: 'Design' })
  })
  it('accepts up to the limit and no more', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://example.com/${i}` }))
    expect(referenceLinksSchema.safeParse(many(RESOURCE_LIMITS.links)).success).toBe(true)
    expect(referenceLinksSchema.safeParse(many(RESOURCE_LIMITS.links + 1)).success).toBe(false)
    expect(referenceLinksSchema.safeParse([]).success).toBe(true)
  })
  it.each([
    [{ url: 'javascript:alert(1)' }],
    [{ url: { $ne: '' } }],
    [{ url: 'https://example.com', label: 'x'.repeat(RESOURCE_LIMITS.linkLabel + 1) }],
    [{}],
  ])('rejects %j', (link) => {
    expect(referenceLinkSchema.safeParse(link).success).toBe(false)
  })
  it('drops fields a client must not set', () => {
    expect(referenceLinkSchema.parse({ url: 'https://example.com', _id: 'x', createdBy: 'y' })).toEqual({ url: 'https://example.com/' })
  })
})
