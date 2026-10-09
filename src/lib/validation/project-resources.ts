import { z } from 'zod'
import { RESOURCE_LIMITS as L, normalizeUrl } from '@/lib/project-resources'

/** One reference link. The address is checked (http/https only) and stored in its cleaned form. */
export const referenceLinkSchema = z.object({
  label: z.string().trim().max(L.linkLabel).optional(),
  url: z
    .string()
    .max(L.linkUrl)
    .transform((value, ctx) => {
      const clean = normalizeUrl(value)
      if (!clean) {
        ctx.addIssue({ code: 'custom', message: 'Enter a valid web address (http or https)' })
        return z.NEVER
      }
      return clean
    }),
})

export const referenceLinksSchema = z.array(referenceLinkSchema).max(L.links)
