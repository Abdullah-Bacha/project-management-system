import type { ReferenceLink } from '@/types'

/** Limits for a project's reference material, shared by the API and the forms. */
export const RESOURCE_LIMITS = {
  links: 10,
  linkLabel: 100,
  linkUrl: 500,
  /** Files shared with a project (task attachments have their own limit). */
  files: 20,
} as const

/**
 * A web address a person may safely open: http(s) only. `javascript:`, `data:`,
 * `file:` and the like are refused. Returns the cleaned address, or null.
 */
export function normalizeUrl(raw: string): string | null {
  const text = raw.trim()
  if (!text || text.length > RESOURCE_LIMITS.linkUrl || text.startsWith('//')) return null
  // A bare "figma.com/file/…" is accepted as https.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname.includes('.')) return null
    return url.toString()
  } catch {
    return null
  }
}

export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** What to call a link: its label, else its host. */
export const linkTitle = (link: ReferenceLink): string => link.label?.trim() || hostOf(link.url)

export const isFigma = (url: string): boolean => /(^|\.)figma\.com$/.test(hostOf(url))
